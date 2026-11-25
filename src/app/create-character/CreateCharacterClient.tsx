"use client";
import { renderCreateCharacterClientView } from "./CreateCharacterClient.view";

import { fetchJson } from "@/lib/observability/fetchJson";

import { getStoredConsent } from "@/components/CookieConsent";

import {
  useState,
  useReducer,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";

import { partiesApiUrl } from "@/lib/urls";
import { JP_REGIONS } from "@/lib/constants/japan";

import { formatLocalAmountFull } from "@/lib/utils/formatters";
import {
  getWealthBonus,
  WEALTH_LEVELS,
  convertStartingAnchorToLocal,
  resolveStartingCurrency,
  type WealthLevel,
} from "@/lib/constants/characterWealth";
import { nearestParty, type CompassPoint } from "@/lib/registration/alignment";
import type { State } from "@/lib/db/types";

import type { PartyOption, CountryCreationInfo } from "../register/components/registerTypes";

import { defaultStatBuild, pointsRemaining } from "@/components/stats/StatPointAllocator";

import { type CompassParty } from "./CompassPicker";

import { type CandidateFileRequirement } from "./CandidateFile";

import { useImagePick, uploadCharacterImage, settleWithin } from "./useImagePick";
import { EDUCATION_OPTIONS, GENDER_OPTIONS, RACE_OPTIONS } from "./creatorOptions";

import { useStartingPartyOptions } from "./useStartingPartyOptions";
import { isStartingPartyEligible } from "@/lib/registration/rules/startingParty";
import {
  classifyCreateCharacterError,
  sendIntakeBeacon,
  sendIntakeBeaconOnce,
} from "@/lib/analytics/intakeBeacon";
import {
  clearCreateCharacterDraft,
  readCreateCharacterDraft,
  writeCreateCharacterDraft,
} from "./createCharacterDraft";

import { discordGateReducer, initialDiscordGateState } from "./discordGateState";
import { ACCOUNT_CHANGED_MESSAGE } from "@/lib/auth/rules/providerLinkSession";

const JP_REGION_ID_SET = new Set(JP_REGIONS.map((r) => r.id));

interface GameCreationInfo {
  baseRates?: import("@/lib/campaigns/rules/currency").CampaignCurrencyRates;
  gameDate: string;
  startDate: string;
  flavorText: string;
  /** In-game date the flavour text is written in: the world's opening turn. */
  flavorDate: string;
  preset: string;
  countries: CountryCreationInfo[];
}

/** Uniform integer in [0, n). Not a secret, but the draft it feeds is saved. */
function randomIndex(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomIndex(arr.length)];
}

/** Upload budget for the optional portrait/header, in ms. */
const IMAGE_UPLOAD_BUDGET_MS = 15_000;

/** Region wording differs by country — the UK and Japan have no "states". */
function regionNounFor(countryId: string): string {
  return countryId === "uk" || countryId === "jp" ? "region" : "state";
}

function useCreateCharacterClientContext() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const [authChecked, setAuthChecked] = useState(false);
  // A failed session or data load used to send a signed-in player to /login or
  // leave the pickers empty. Both now show a retry instead.
  // One state object (the component is at the architecture audit's useState
  // budget): session reachability, data-load failure, the retry counter, and
  // the account the draft belongs to. Drafts restore once the session
  // resolves, and only then start saving, so a fresh mount never overwrites a
  // saved draft with empty defaults.
  const [loadState, setLoadState] = useState({
    authUnavailable: false,
    dataLoadFailed: false,
    attempt: 0,
    userId: null as string | null,
    draftRestored: false,
  });
  const { authUnavailable, dataLoadFailed, userId, draftRestored } = loadState;
  const patchLoadState = useCallback(
    (patch: Partial<typeof loadState>) => setLoadState((prev) => ({ ...prev, ...patch })),
    []
  );
  const pendingDraftParty = useRef<{
    country: string;
    homeState: string;
    party: string;
    touched: boolean;
  } | null>(null);
  const [states, setStates] = useState<State[]>([]);
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  const [partyOptionsLoadedFor, setPartyOptionsLoadedFor] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creationInfo, setCreationInfo] = useState<GameCreationInfo | null>(null);
  const [countryOptions, setCountryOptions] = useState<CountryCreationInfo[] | undefined>(
    undefined
  );
  const [statePlayerCounts, setStatePlayerCounts] = useState<Record<string, number>>({});

  const [
    { discordLinked, discordRequired, showDiscordPrompt, discordPromptDismissed },
    dispatchDiscord,
  ] = useReducer(discordGateReducer, initialDiscordGateState);
  const onDiscordLinked = useCallback(() => {
    dispatchDiscord({ type: "linked" });
  }, []);
  const [discordAccountChanged, setDiscordAccountChanged] = useState(false);
  const onDiscordAccountChanged = useCallback(() => {
    setDiscordAccountChanged(true);
    dispatchDiscord({ type: "dismiss" });
    setError(ACCOUNT_CHANGED_MESSAGE);
  }, []);
  useEffect(() => {
    let mounted = true;
    const refreshRequirement = () => {
      fetchJson<{ discordLinkRequired?: boolean }>("/api/auth/signup-methods", {
        cache: "no-store",
        feature: "discord-character-gate",
      })
        .then((data) => {
          if (mounted && data) {
            dispatchDiscord({ type: "requirement", required: data.discordLinkRequired === true });
          }
        })
        .catch(() => {
          if (mounted)
            setError(
              "We could not check Discord linking requirements. Please retry or link Discord before creating your character."
            );
        });
    };
    refreshRequirement();
    window.addEventListener("focus", refreshRequirement);
    return () => {
      mounted = false;
      window.removeEventListener("focus", refreshRequirement);
    };
  }, []);
  const [discordData, setDiscordData] = useState<{
    discordId?: string;
    discordUsername?: string;
    discordAvatar?: string;
  }>({});

  const [country, setCountry] = useState<string>("");

  // Optional portrait / header. Held locally and uploaded once the character
  // exists, since both upload routes write onto an existing character doc.
  const portrait = useImagePick(2 * 1024 * 1024);
  const header = useImagePick(4 * 1024 * 1024);

  // RPG stat allocation: opens with every stat on the floor, 21 points to spend.
  const [stats, setStats] = useState(defaultStatBuild());

  // Steps 4 and 5 open on a legal default (compass centre, Independent); neither counts as answered until touched, so the player cannot skip past the party step into an unviable character.
  const [compassTouched, setCompassTouched] = useState(false);
  const [partyTouched, setPartyTouched] = useState(false);
  // Gated behind the RPG-stats feature flag (from /api/auth/me).
  // Guided chat is opt-in and persisted. The classic all-steps form stays the
  // default, so current player behavior is unchanged unless chosen.
  const savedChatMode = useSyncExternalStore(
    subscribeCreatorFlow,
    readCreatorFlow,
    defaultCreatorFlow
  );
  const [chosenChatMode, setChatMode] = useState<boolean | null>(null);
  const chatMode = chosenChatMode ?? savedChatMode;

  const setFlow = (chat: boolean) => {
    setChatMode(chat);
    try {
      window.localStorage.setItem("ahd-creator-flow", chat ? "chat" : "steps");
    } catch {
      // Best effort only; the in-memory choice still applies.
    }
  };
  // Guided-chat progression parked while the classic form is shown. Answers
  // stay in the form state above; only the shell's active/reached pointers
  // rest here during the page lifetime, so toggling flows never re-walks.
  const [chatProgress, setChatProgress] = useState<{
    activeId: string | null;
    reached: string[];
  }>({ activeId: null, reached: [] });
  const handleChatProgress = useCallback((progress: { activeId: string; reached: string[] }) => {
    setChatProgress(progress);
  }, []);

  const [formData, setFormData] = useState({
    characterName: "",
    homeState: "",
    party: "independent",
    policyPositions: {
      economic: 0,
      social: 0,
    },
    demographics: {
      race: "",
      gender: "",
      education: "",
      wealth: "",
    },
  });

  const filteredStates = useMemo(
    () =>
      country
        ? states.filter((s) => {
            const c = country.toLowerCase();
            if ((s.countryId ?? "US").toLowerCase() === c) return true;
            return c === "jp" && !s.countryId && JP_REGION_ID_SET.has(s._id);
          })
        : [],
    [country, states]
  );

  const parties = useMemo(
    () => (partyOptionsLoadedFor === country ? partyOptions : []),
    [partyOptionsLoadedFor, country, partyOptions]
  );
  const { eligibleParties, majorParties, communityParties } = useStartingPartyOptions(
    parties,
    formData,
    isAdmin,
    setFormData,
    setPartyTouched
  );

  // Save progress as the player goes, so a reload, a dropped connection or a
  // closed tab does not cost them the form.
  useEffect(() => {
    if (!draftRestored || !userId) return;
    const timer = setTimeout(() => {
      writeCreateCharacterDraft(userId, {
        country,
        formData,
        stats,
        compassTouched,
        partyTouched,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [draftRestored, userId, country, formData, stats, compassTouched, partyTouched]);

  // Scroll to error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  // Restore saved progress once the account id is known. The party picker
  // drops any party missing from the (still loading) option list, so a saved
  // party is parked and re-applied when that country's options arrive.
  const restoreDraft = (accountId: string) => {
    const draft = readCreateCharacterDraft(accountId, defaultStatBuild());
    if (!draft) return;
    setCountry(draft.country);
    setFormData({ ...draft.formData, party: "independent" });
    if (draft.stats) setStats(draft.stats);
    setCompassTouched(draft.compassTouched);
    if (draft.formData.party !== "independent") {
      pendingDraftParty.current = {
        country: draft.country,
        homeState: draft.formData.homeState,
        party: draft.formData.party,
        touched: draft.partyTouched,
      };
    } else {
      setPartyTouched(draft.partyTouched);
    }
  };

  // Session check. The server page has already confirmed a session and that
  // creation is open, so only a definite 401 means "log in". Anything else
  // (network blip, 5xx, cold start) is a retry, never a trip to /login that
  // throws away what the player has entered.
  useEffect(() => {
    const loginUrl = "/login?returnUrl=" + encodeURIComponent("/create-character");
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.status === 401) {
          router.replace(loginUrl);
          return;
        }
        if (!res.ok) throw new Error(`auth/me ${res.status}`);
        const data = await res.json();
        if (!data.user) {
          router.replace(loginUrl);
          return;
        }
        // A non-admin who already has an active character does not belong on the
        // creation screen — send them into the app. (Admins retain multi-character
        // support and may create additional characters here.) This also prevents
        // anyone getting stuck here from a stale character-gate hint cookie.
        setIsAdmin(data.user.isAdmin === true);
        if (data.user.hasCharacter && !data.user.isAdmin) {
          // Straight to /profile, avoiding the /dashboard redirect stub during a
          // client-side navigation (see the note on the post-create push below).
          router.replace("/profile");
          return;
        }
        // Capture Discord linking state. Apple sign-in satisfies the gate on
        // its own, once per Apple ID, so the prompt stays closed for those accounts.
        if (data.user.discordId || data.user.appleExemptsDiscord) {
          dispatchDiscord({ type: "linked" });
        }
        if (data.user.discordId) {
          setDiscordData({
            discordId: data.user.discordId,
            discordUsername: data.user.discordUsername,
            discordAvatar: data.user.discordAvatar,
          });
        }
        if (typeof data.user.id === "string") restoreDraft(data.user.id);
        patchLoadState({
          userId: typeof data.user.id === "string" ? data.user.id : null,
          draftRestored: true,
        });
        patchLoadState({ authUnavailable: false });
        setAuthChecked(true);
        sendIntakeBeaconOnce("create_character_viewed", "create_character_viewed", {
          surface: "create_character",
        });
      } catch {
        patchLoadState({ authUnavailable: true });
        sendIntakeBeacon("create_character_load_failed", {
          surface: "create_character",
          reason: "session_unavailable",
        });
      }
    };
    checkAuth();
  }, [router, loadState.attempt, patchLoadState]);

  // Fetch states and full creation info (countries + game date + flavor text)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statesRes, countriesRes, stateCountsRes] = await Promise.all([
          fetch("/api/game/states?playableHome=1"),
          fetch("/api/game/countries"),
          fetch("/api/game/state-player-counts"),
        ]);
        if (statesRes.ok) setStates(await statesRes.json());
        const failed = !statesRes.ok || !countriesRes.ok;
        patchLoadState({ dataLoadFailed: failed });
        if (failed) {
          sendIntakeBeacon("create_character_load_failed", {
            surface: "create_character",
            reason: !countriesRes.ok ? "countries_unavailable" : "states_unavailable",
          });
        }
        if (stateCountsRes.ok) {
          const countsData = await stateCountsRes.json();
          setStatePlayerCounts(countsData.counts ?? {});
        }
        if (countriesRes.ok) {
          const data = await countriesRes.json();
          setCreationInfo({
            gameDate: data.gameDate,
            startDate: data.startDate,
            flavorText: data.flavorText,
            flavorDate: data.flavorDate ?? data.startDate,
            preset: data.preset,
            countries: data.countries ?? [],
          });
          setCountryOptions(data.countries ?? []);
        } else {
          setCountryOptions([]);
          setCreationInfo(null);
        }
      } catch (err) {
        console.error("Failed to fetch initial data:", err);
        patchLoadState({ dataLoadFailed: true });
        sendIntakeBeacon("create_character_load_failed", {
          surface: "create_character",
          reason: "network",
        });
      }
    };
    fetchData();
  }, [loadState.attempt, patchLoadState]);

  // If server drops a country from the enabled list, clear a stale selection (empty region list).
  if (countryOptions !== undefined && country && !countryOptions.some((o) => o.id === country)) {
    setCountry("");
    setPartyTouched(false);
    setFormData((prev) => ({ ...prev, homeState: "", party: "independent" }));
  }

  // Fetch parties when country changes
  useEffect(() => {
    if (!country) return;
    let cancelled = false;
    const fetchParties = async () => {
      try {
        const res = await fetch(`${partiesApiUrl(country)}?includeFrontier=1&includeRegionalOrg=1`);
        if (res.ok) {
          const data = await res.json();
          // Guard against out-of-order responses when the country selection
          // changes again before this request resolves.
          if (!cancelled) {
            const loaded: PartyOption[] = data.parties ?? [];
            setPartyOptions(loaded);
            setPartyOptionsLoadedFor(country);
            const pending = pendingDraftParty.current;
            if (pending && pending.country === country) {
              pendingDraftParty.current = null;
              const party = loaded.find((p) => p.id === pending.party);
              if (party && isStartingPartyEligible(party, pending.homeState, isAdmin)) {
                setFormData((prev) => ({ ...prev, party: pending.party }));
                setPartyTouched(pending.touched);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch parties:", err);
      }
    };
    fetchParties();
    return () => {
      cancelled = true;
    };
  }, [country, isAdmin]);

  const handleCountrySelect = (c: string) => {
    setCountry(c);
    // Party resets to Independent with the country, so the deliberate-choice
    // flag has to reset with it.
    setPartyTouched(false);
    setFormData((prev) => ({ ...prev, homeState: "", party: "independent" }));
  };

  /**
   * Randomize picks the country first, then draws the name from that
   * country's NPP pool so names match the chosen country.
   */
  const handleRandomize = useCallback(async () => {
    if (!countryOptions || countryOptions.length === 0) return;
    const randomCountry = pick(countryOptions);
    const cId = randomCountry.id;

    // Every country's name pools are loaded on the first roll rather than
    // shipped with the page, since most players never press Randomize.
    const { generateUniqueNPPNameAndGender } = await import("@/lib/npp/nameGenerator");
    // The generated gender is carried into demographics so the name and the
    // character it describes agree.
    const generated =
      generateUniqueNPPNameAndGender([], 100, cId) ?? generateUniqueNPPNameAndGender([], 100);
    const randomName = generated?.name ?? "";

    // Pick a random state from that country
    const cStates = states.filter((s) => {
      const uc = cId.toLowerCase();
      if ((s.countryId ?? "US").toLowerCase() === uc) return true;
      return uc === "jp" && !s.countryId && JP_REGION_ID_SET.has(s._id);
    });
    const randomState = cStates.length > 0 ? pick(cStates)._id : "";

    // Pick a random party from default parties (fallback to independent)
    const defaultParties =
      cId === country
        ? parties.filter((p) => p.isDefault && isStartingPartyEligible(p, randomState, isAdmin))
        : [];
    const randomParty = defaultParties.length > 0 ? pick(defaultParties).id : "independent";

    // Pick random policy positions
    const randomEconomic = randomIndex(11) - 5;
    const randomSocial = randomIndex(11) - 5;

    setCountry(cId);
    // Randomize answers both open-default steps on the player's behalf.
    setCompassTouched(true);
    setPartyTouched(true);
    setFormData({
      characterName: randomName,
      homeState: randomState,
      party: randomParty,
      policyPositions: {
        economic: randomEconomic,
        social: randomSocial,
      },
      demographics: {
        race: pick(RACE_OPTIONS).value,
        gender: generated?.gender ?? pick(GENDER_OPTIONS).value,
        education: pick(EDUCATION_OPTIONS).value,
        wealth: pick(WEALTH_LEVELS).value,
      },
    });
  }, [countryOptions, states, parties, country, isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (discordAccountChanged || !userId) {
      setError(ACCOUNT_CHANGED_MESSAGE);
      return;
    }
    setIsLoading(true);
    setError("");
    // Save what is being filed right now, ahead of the debounced autosave, so
    // a refused or interrupted submit never loses the latest answers.
    if (userId) {
      writeCreateCharacterDraft(userId, { country, formData, stats, compassTouched, partyTouched });
    }

    if (discordRequired && !discordLinked) {
      dispatchDiscord({ type: "show" });
      setIsLoading(false);
      return;
    }

    if (!formData.characterName || formData.characterName.length < 2) {
      setError("Please enter a character name");
      setIsLoading(false);
      return;
    }

    if (!country) {
      setError("Please select a country to play in");
      setIsLoading(false);
      return;
    }

    if (!formData.homeState) {
      setError(`Please select a home ${regionNounFor(country)}`);
      setIsLoading(false);
      return;
    }

    if (formData.party !== "independent" && !eligibleParties.some((p) => p.id === formData.party)) {
      setError("Choose an eligible party for your home region, or start as Independent.");
      setIsLoading(false);
      return;
    }

    if (
      !formData.demographics.race ||
      !formData.demographics.gender ||
      !formData.demographics.education ||
      !formData.demographics.wealth
    ) {
      setError("Please select all background options for your character");
      setIsLoading(false);
      return;
    }

    if (pointsRemaining(stats) !== 0) {
      setError("Please allocate all of your stat points before continuing");
      setIsLoading(false);
      return;
    }

    // Only creation itself can fail the submit. Once the POST succeeds the
    // character exists, and reporting a failure — or spinning forever — for a
    // character the player already owns is worse than a cold nav.
    try {
      const characterRes = await fetch("/api/auth/character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUserId: userId,
          analyticsConsent: getStoredConsent() === "accepted",
          name: formData.characterName,
          homeState: formData.homeState,
          // Country selection happens earlier in the flow; pass it explicitly so
          // the server can scope the state lookup against cross-country
          // state-ID collisions (e.g. CN HB / DE HB).
          countryId: country.toUpperCase(),
          party: formData.party,
          policies: formData.policyPositions,
          demographics: formData.demographics,
          stats,
        }),
      });

      const characterData = await characterRes.json().catch(() => ({}));
      if (!characterRes.ok) {
        if (characterData.code === "ACCOUNT_CHANGED") onDiscordAccountChanged();
        if (characterData.code === "DISCORD_LINK_REQUIRED") {
          dispatchDiscord({ type: "server-required" });
        }
        const message: string = characterData.error || "Failed to create character";
        sendIntakeBeacon("create_character_submit_failed", {
          surface: "create_character",
          reason: classifyCreateCharacterError(characterRes.status, message),
        });
        if (characterRes.status === 503) {
          throw new Error(
            "Character creation just paused for maintenance. Your answers are saved on this device, so you can finish when it reopens."
          );
        }
        throw new Error(message);
      }
      if (userId) clearCreateCharacterDraft(userId);
      await import("@/lib/analytics/capture")
        .then(({ rememberNewCharacter }) => {
          if (
            typeof characterData.characterId === "string" &&
            typeof characterData.createdTurn === "number"
          ) {
            rememberNewCharacter(characterData.characterId, characterData.createdTurn, {
              startingNationId:
                typeof characterData.countryId === "string"
                  ? characterData.countryId
                  : country.toUpperCase(),
              creationPath: "character_creation_flow",
              ...(typeof characterData.characterCount === "number"
                ? { characterCount: characterData.characterCount }
                : {}),
            });
          }
        })
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
      return;
    }

    // Images are optional extras: the character already exists, so a failed or
    // slow upload must not fail creation. The player can set them later on their
    // profile page.
    await settleWithin(
      Promise.all([
        portrait.file ? uploadCharacterImage("/api/upload/avatar", portrait.file) : null,
        header.file ? uploadCharacterImage("/api/upload/profile-header", header.file) : null,
      ]),
      IMAGE_UPLOAD_BUDGET_MS
    );

    // Hard nav instead of router.refresh() + router.push(). A full document load
    // re-fetches every server component and re-reads the new auth cookie state,
    // which a soft nav after refresh() cannot do reliably (the push races the
    // cache invalidation and gets dropped, leaving the button spinning forever).
    window.location.assign(new URL("/profile", window.location.origin).href);
  };

  // ── Derived view state ─────────────────────────────────────────────────────

  const position: CompassPoint = {
    economic: formData.policyPositions.economic,
    social: formData.policyPositions.social,
  };
  const regionNoun = regionNounFor(country);
  const selectedCountry = countryOptions?.find((o) => o.id === country) ?? null;
  const selectedState = filteredStates.find((s) => s._id === formData.homeState) ?? null;

  const electorate: CompassPoint | null =
    selectedState?.cachedEconomicLean != null && selectedState.cachedSocialLean != null
      ? { economic: selectedState.cachedEconomicLean, social: selectedState.cachedSocialLean }
      : null;

  const compassParties: CompassParty[] = useMemo(
    () =>
      parties.flatMap((p) =>
        p.economicPosition == null || p.socialPosition == null
          ? []
          : [
              {
                id: p.id,
                name: p.name,
                abbreviation: p.abbreviation,
                color: p.color,
                economic: p.economicPosition,
                social: p.socialPosition,
              },
            ]
      ),
    [parties]
  );

  const isOnePartyState = selectedCountry?.governmentType === "onePartyState";
  const rulingParty = parties.find((p) => p.regimeStatus === "ruling") ?? null;

  const closest = nearestParty(position, compassParties);
  const selectedParty = parties.find((p) => p.id === formData.party) ?? null;
  const selectedPartyPoint: CompassPoint | null =
    selectedParty?.economicPosition != null && selectedParty.socialPosition != null
      ? { economic: selectedParty.economicPosition, social: selectedParty.socialPosition }
      : null;

  // Same function the API route applies, so preview == grant. The preset must
  // thread through too: a 2027 euro-member preview prices in EUR, matching
  // the EUR grant, instead of the legacy code at the legacy rate.
  const worldPreset = creationInfo?.preset;
  const { currencyCode } = resolveStartingCurrency(country, creationInfo?.baseRates, worldPreset);
  const wealthOptions = WEALTH_LEVELS.map(({ value, label }) => ({
    value,
    label,
    note: formatLocalAmountFull(
      convertStartingAnchorToLocal(
        getWealthBonus(value, worldPreset),
        country,
        creationInfo?.baseRates,
        worldPreset
      ),
      currencyCode
    ),
  }));

  const startingCapital = formData.demographics.wealth
    ? formatLocalAmountFull(
        convertStartingAnchorToLocal(
          getWealthBonus(formData.demographics.wealth as WealthLevel, worldPreset),
          country,
          creationInfo?.baseRates,
          worldPreset
        ),
        currencyCode
      )
    : null;

  const backgroundComplete = Boolean(
    formData.demographics.race &&
    formData.demographics.gender &&
    formData.demographics.education &&
    formData.demographics.wealth
  );

  const noPartiesAvailable =
    Boolean(country) && partyOptionsLoadedFor === country && parties.length === 0;
  const partySelectorVisible = Boolean(country) && !noPartiesAvailable;

  const statPointsLeft = pointsRemaining(stats);
  const requirements: CandidateFileRequirement[] = [
    ...(discordAccountChanged
      ? [{ key: "account", label: "Reload your signed-in account", met: false }]
      : []),
    { key: "country", label: "Choose a country", met: Boolean(country) },
    { key: "name", label: "Name your politician", met: formData.characterName.trim().length >= 2 },
    { key: "background", label: "Complete the background", met: backgroundComplete },
    { key: "region", label: `Choose a home ${regionNoun}`, met: Boolean(formData.homeState) },
    // When parties exist, Independent is the opening value, so require a
    // deliberate choice. An empty list is already an implicit Independent
    // start and must not block filing.
    {
      key: "party",
      label: noPartiesAvailable
        ? "No founded parties yet"
        : "Pick a party, or choose Independent on purpose",
      met: noPartiesAvailable || partyTouched,
    },
    {
      key: "stats",
      label: `Allocate ${statPointsLeft} remaining stat point${statPointsLeft === 1 ? "" : "s"}`,
      met: statPointsLeft === 0,
    },
  ];

  const countriesLoading = countryOptions === undefined;

  // ── Creator panels, shared by both flows ──────────────────────────────
  // The classic form renders every panel at once; guided chat renders one at
  // a time through ConversationShell. Same components, same validation, same
  // submit handler either way, so the filed payload cannot drift between
  // flows.
  const errorBanner = error ? (
    <div
      ref={errorRef}
      role="alert"
      className="rounded border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error"
    >
      {error}
    </div>
  ) : null;
  return {
    kind: "context" as const,
    context: {
      AxisStepper,
      authChecked,
      authUnavailable,
      backgroundComplete,
      chatMode,
      chatProgress,
      closest,
      communityParties,
      compassParties,
      compassTouched,
      countriesLoading,
      country,
      countryOptions,
      creationInfo,
      dataLoadFailed,
      discordData,
      discordLinked,
      discordPromptDismissed,
      discordRequired,
      dispatchDiscord,
      electorate,
      errorBanner,
      filteredStates,
      formData,
      handleChatProgress,
      handleCountrySelect,
      handleRandomize,
      handleSubmit,
      header,
      isLoading,
      isOnePartyState,
      majorParties,
      noPartiesAvailable,
      onDiscordLinked,
      onDiscordAccountChanged,
      discordAccountChanged,
      parties,
      partySelectorVisible,
      partyTouched,
      portrait,
      position,
      regionNoun,
      requirements,
      rulingParty,
      selectedCountry,
      selectedParty,
      selectedPartyPoint,
      selectedState,
      setCompassTouched,
      setFlow,
      setFormData,
      setLoadState,
      setPartyTouched,
      setStats,
      showDiscordPrompt,
      startingCapital,
      statPointsLeft,
      statePlayerCounts,
      states,
      stats,
      userId,
      wealthOptions,
    },
  };
}
export type CreateCharacterClientViewContext = Extract<
  ReturnType<typeof useCreateCharacterClientContext>,
  { kind: "context" }
>["context"];

export default function CreateCharacterClient(
  ...args: Parameters<typeof useCreateCharacterClientContext>
) {
  const result = useCreateCharacterClientContext(...args);
  return renderCreateCharacterClientView(result.context);
}

/**
 * −5..+5 axis control. Keeps a precise, screen-reader-friendly path to every
 * value that a drag-only compass pin cannot offer on its own.
 */
function AxisStepper({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-body-sm font-medium text-muted">{label}</span>
        <span className="font-mono text-body-sm tabular-nums">
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      {/* The `policy-slider` rule styles the thumb only, so the track is drawn
          behind the transparent input. */}
      <div className="relative py-1.5">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
          {Array.from({ length: 11 }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-px ${i === 5 ? "bg-muted" : "bg-card-border"}`}
              aria-hidden
            />
          ))}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-track"
        />
        <input
          type="range"
          min={-5}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          aria-label={`${label} position`}
          className="policy-slider relative h-4 w-full cursor-pointer appearance-none bg-transparent"
        />
      </div>
      <div className="flex justify-between text-body-sm text-muted">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

const subscribeCreatorFlow = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};
const defaultCreatorFlow = () => false;
function readCreatorFlow() {
  try {
    return window.localStorage.getItem("ahd-creator-flow") === "chat";
  } catch {
    return false;
  }
}
