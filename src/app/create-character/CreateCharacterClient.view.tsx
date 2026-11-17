"use client";
import type { ReactNode } from "react";
import type { CreateCharacterClientViewContext } from "./CreateCharacterClient";

import Link from "next/link";

import Image from "next/image";

import { Input, Skeleton, Modal } from "@/components/ui";

import { bypassNextImageOptimization } from "@/lib/images/bypassImageOptimization";

import { ideologyLabel } from "@/lib/registration/alignment";

import type { CountryId } from "@/lib/constants/countriesCore";

import { DiscordLinkSection } from "./DiscordLinkSection";
import { StatPointAllocator } from "@/components/stats/StatPointAllocator";
import { STAT_FREE_POINTS, STAT_MIN } from "@/lib/stats/statsConstants";
import { ChipGroup, FieldCaption, StepPanel } from "./creatorPrimitives";
import { CompassPicker } from "./CompassPicker";
import { CompassLegend } from "./CompassLegend";
import { HomeStatePicker } from "./HomeStatePicker";
import { PartyPicker } from "./PartyPicker";
import { CandidateFile } from "./CandidateFile";
import { OnePartyStateNotice } from "./OnePartyStateNotice";

import { EDUCATION_OPTIONS, GENDER_OPTIONS, RACE_OPTIONS, labelFor } from "./creatorOptions";
import { buildConversationSteps, type ConversationStepId } from "./conversationSteps";
import { ConversationShell } from "./ConversationShell";

import { writeCreateCharacterDraft } from "./createCharacterDraft";

export function renderCreateCharacterClientView(
  context: CreateCharacterClientViewContext
): ReactNode {
  const {
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
  } = context;

  const countryPanel = (
    <StepPanel
      step={1}
      title="Country"
      subtitle="Sets your offices, parties, currency, and electoral rules."
      complete={Boolean(country)}
    >
      {countryOptions === undefined ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : countryOptions.length === 0 ? (
        <p className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning">
          No countries are open to new characters right now. Please try again later or contact
          support.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {countryOptions.map((option) => {
              const selected = country === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleCountrySelect(option.id)}
                  aria-pressed={selected}
                  className={`flex items-center gap-3 rounded border px-3 py-2 text-left transition-colors ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-card-border bg-card-muted hover:border-primary/40"
                  }`}
                >
                  <span className="relative h-7 w-10 shrink-0 overflow-hidden rounded-sm">
                    <Image
                      src={option.flagUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                      unoptimized={bypassNextImageOptimization(option.flagUrl)}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold">{option.name}</span>
                    <span className="block truncate text-body-xs text-muted">{option.desc}</span>
                  </span>
                  <span
                    className="shrink-0 font-mono text-body-xs text-muted"
                    title={`${option.playerCount} registered players`}
                  >
                    {option.playerCount}
                  </span>
                </button>
              );
            })}
          </div>

          {isOnePartyState && selectedCountry && (
            <div className="mt-2">
              <OnePartyStateNotice
                countryName={selectedCountry.name}
                rulingPartyName={rulingParty?.name ?? null}
                countryId={selectedCountry.id}
              />
            </div>
          )}
        </>
      )}
    </StepPanel>
  );

  const politicianPanel = (
    <StepPanel
      step={2}
      title="The politician"
      subtitle="Voter groups weigh these when they decide whether you are one of them."
      complete={formData.characterName.trim().length >= 2 && backgroundComplete}
      disabled={!country}
    >
      <div className="space-y-4">
        <div>
          <FieldCaption required>Name</FieldCaption>
          <div className="flex gap-2">
            <Input
              id="characterName"
              type="text"
              value={formData.characterName}
              onChange={(e) => setFormData((prev) => ({ ...prev, characterName: e.target.value }))}
              className="min-w-0 flex-1 bg-background"
              placeholder="e.g. Eleanor Vance"
            />
            <button
              type="button"
              onClick={handleRandomize}
              className="shrink-0 rounded border border-dashed border-card-border px-3 text-body-sm text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              Randomize all
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ChipGroup
            label="Gender"
            required
            value={formData.demographics.gender}
            options={GENDER_OPTIONS.map((o) => ({ ...o }))}
            onChange={(gender) =>
              setFormData((prev) => ({
                ...prev,
                demographics: { ...prev.demographics, gender },
              }))
            }
          />
          <ChipGroup
            label="Race"
            required
            value={formData.demographics.race}
            options={RACE_OPTIONS.map((o) => ({ ...o }))}
            onChange={(race) =>
              setFormData((prev) => ({
                ...prev,
                demographics: { ...prev.demographics, race },
              }))
            }
          />
          <ChipGroup
            label="Education"
            required
            value={formData.demographics.education}
            options={EDUCATION_OPTIONS.map((o) => ({ ...o }))}
            onChange={(education) =>
              setFormData((prev) => ({
                ...prev,
                demographics: { ...prev.demographics, education },
              }))
            }
          />
          <ChipGroup
            label="Wealth"
            required
            hint="Starting capital"
            value={formData.demographics.wealth}
            options={wealthOptions}
            onChange={(wealth) =>
              setFormData((prev) => ({
                ...prev,
                demographics: { ...prev.demographics, wealth },
              }))
            }
          />
        </div>
      </div>
    </StepPanel>
  );

  const regionPanel = (
    <StepPanel
      step={3}
      title={`Home ${regionNoun}`}
      subtitle="Your first constituency. Its electorate decides your early races."
      complete={Boolean(formData.homeState)}
      disabled={!country}
    >
      {filteredStates.length === 0 ? (
        <p className="rounded border border-dashed border-card-border px-3 py-6 text-center text-body-sm text-muted">
          {!country
            ? "Choose a country first."
            : states.length === 0
              ? `Loading ${regionNoun}s…`
              : `No ${regionNoun}s are available for this country yet.`}
        </p>
      ) : (
        <HomeStatePicker
          states={filteredStates}
          value={formData.homeState}
          onChange={(homeState) => setFormData((prev) => ({ ...prev, homeState }))}
          playerCounts={statePlayerCounts}
          position={position}
          regionNoun={regionNoun}
          parties={parties}
        />
      )}
    </StepPanel>
  );

  const compassPanel = (
    <StepPanel
      step={4}
      title="Where you stand"
      subtitle="Drag your pin. Distance to a platform is what primaries and general elections actually measure."
      complete={compassTouched}
      disabled={!country}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <CompassPicker
          value={position}
          onChange={(next) => {
            setCompassTouched(true);
            setFormData((prev) => ({ ...prev, policyPositions: { ...next } }));
          }}
          parties={compassParties}
          electorate={
            electorate && selectedState
              ? { ...electorate, label: `${selectedState.name} electorate` }
              : null
          }
          selectedPartyId={formData.party}
          highlightPartyId={closest?.party.id}
          pinColor={selectedParty?.color}
        />

        <div className="space-y-3">
          <AxisStepper
            label="Economic"
            leftLabel="Left"
            rightLabel="Right"
            value={position.economic}
            onChange={(economic) => {
              setCompassTouched(true);
              setFormData((prev) => ({
                ...prev,
                policyPositions: { ...prev.policyPositions, economic },
              }));
            }}
          />
          <AxisStepper
            label="Social"
            leftLabel="Liberal"
            rightLabel="Traditional"
            value={position.social}
            onChange={(social) => {
              setCompassTouched(true);
              setFormData((prev) => ({
                ...prev,
                policyPositions: { ...prev.policyPositions, social },
              }));
            }}
          />

          <CompassLegend
            position={position}
            parties={compassParties}
            electorate={
              electorate && selectedState
                ? { ...electorate, label: `${selectedState.name} electorate` }
                : null
            }
            regionNoun={regionNoun}
          />
        </div>
      </div>
    </StepPanel>
  );

  const partyPanel = (
    <StepPanel
      step={5}
      title="Party"
      subtitle="Choose a home region first. Available parties must have a presence there or nearby. Parties requiring approval can be joined by application after starting as Independent."
      complete={partyTouched}
      disabled={!country}
    >
      {!country ? (
        <p className="rounded border border-dashed border-card-border px-3 py-6 text-center text-body-sm text-muted">
          Choose a country first.
        </p>
      ) : (
        <PartyPicker
          countryId={country}
          homeState={formData.homeState}
          value={formData.party}
          onChange={(party) => {
            setPartyTouched(true);
            setFormData((prev) => ({ ...prev, party }));
          }}
          majorParties={majorParties}
          communityParties={communityParties}
          position={position}
          isOnePartyState={isOnePartyState}
        />
      )}
    </StepPanel>
  );

  const statsPanel = (
    <StepPanel
      step={6}
      title="Stats"
      subtitle={`Every stat starts at ${STAT_MIN}. Spend ${STAT_FREE_POINTS} points on top of that. These shift as you play.`}
      complete={statPointsLeft === 0}
    >
      <StatPointAllocator value={stats} onChange={setStats} />
    </StepPanel>
  );

  const discordPanel = (
    <DiscordLinkSection
      expectedUserId={userId}
      accountChanged={discordAccountChanged}
      onAccountChanged={onDiscordAccountChanged}
      initialLinked={discordLinked}
      required={discordRequired}
      onLinked={onDiscordLinked}
      onBeforeLink={() => {
        if (userId)
          writeCreateCharacterDraft(userId, {
            country,
            formData,
            stats,
            compassTouched,
            partyTouched,
          });
      }}
      discordId={discordData.discordId}
      discordUsername={discordData.discordUsername}
      discordAvatar={discordData.discordAvatar}
    />
  );

  const discordGateModal = (
    <Modal
      open={
        !discordLinked &&
        (showDiscordPrompt || (authChecked && discordRequired && !discordPromptDismissed))
      }
      onClose={() => {
        dispatchDiscord({ type: "dismiss" });
      }}
      title="Link Discord to create your character"
    >
      <p className="mb-4 text-body-sm text-muted">
        Your account is ready. Link Discord to this account before creating a new character. Your
        character draft is saved, and existing characters remain playable.
      </p>
      {discordPanel}
    </Modal>
  );

  const fileAside = (
    <>
      <CandidateFile
        name={formData.characterName.trim()}
        countryName={selectedCountry?.name ?? null}
        countryFlagUrl={selectedCountry?.flagUrl ?? null}
        regionName={selectedState?.name ?? null}
        electorate={electorate}
        partyName={formData.party === "independent" ? null : (selectedParty?.name ?? null)}
        partyAbbreviation={
          formData.party === "independent" ? null : (selectedParty?.abbreviation ?? null)
        }
        partyColor={formData.party === "independent" ? null : (selectedParty?.color ?? null)}
        partyId={formData.party === "independent" ? null : (selectedParty?.id ?? null)}
        partyCountryId={country ? (country.toUpperCase() as CountryId) : null}
        partyPoint={selectedPartyPoint}
        position={position}
        demographics={formData.demographics}
        startingCapital={startingCapital}
        requirements={requirements}
        isSubmitting={isLoading}
        portrait={portrait}
        header={header}
        parties={parties}
      />

      <p className="mt-2 px-1 text-body-sm text-muted">
        New here?{" "}
        <Link href="/wiki/getting-started" target="_blank" className="text-primary hover:underline">
          Read the new player guide
        </Link>
      </p>
    </>
  );

  // ── Guided chat assembly ──────────────────────────────────────────────
  // Completion mirrors the submit-time validation above; summaries echo the
  // same display values as the CandidateFile, so the transcript can never
  // promise something the file does not show.
  const politicianSummary = (() => {
    const name = formData.characterName.trim();
    if (name.length < 2) return null;
    const bits = [
      labelFor(GENDER_OPTIONS, formData.demographics.gender),
      labelFor(RACE_OPTIONS, formData.demographics.race),
      labelFor(EDUCATION_OPTIONS, formData.demographics.education),
    ].filter((v) => v !== "—");
    return bits.length > 0 ? `${name}, ${bits.join(" · ")}` : name;
  })();

  const conversationSteps = buildConversationSteps({
    regionNoun,
    partySelectorVisible,
    complete: {
      country: Boolean(country),
      politician: formData.characterName.trim().length >= 2 && backgroundComplete,
      region: Boolean(formData.homeState),
      compass: compassTouched,
      party: noPartiesAvailable || partyTouched,
      stats: statPointsLeft === 0,
      review: requirements.every((r) => r.met),
    },
    summary: {
      country: selectedCountry?.name ?? null,
      politician: politicianSummary,
      region: selectedState?.name ?? null,
      compass: compassTouched ? ideologyLabel(position) : null,
      party: !partyTouched
        ? null
        : formData.party === "independent"
          ? "Independent"
          : (selectedParty?.name ?? "Independent"),
      stats: statPointsLeft === 0 ? "Allocated" : null,
      review: null,
    },
  });

  const renderChatStep = (id: ConversationStepId): ReactNode => {
    switch (id) {
      case "country":
        return countryPanel;
      case "politician":
        return politicianPanel;
      case "region":
        return regionPanel;
      case "compass":
        return compassPanel;
      case "party":
        return partyPanel;
      case "stats":
        return statsPanel;
      case "review":
        return (
          <div className="space-y-4">
            {fileAside}
            {discordPanel}
          </div>
        );
    }
  };

  if (authUnavailable || (authChecked && dataLoadFailed)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div
          role="alert"
          className="w-full max-w-md rounded-xl border border-card-border bg-card p-6 text-center shadow-card"
        >
          <h1 className="text-lg font-semibold">We could not load character creation</h1>
          <p className="mt-2 text-body-sm text-muted">
            The game did not answer in time. You are still signed in, and anything you already
            entered is saved on this device.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadState((prev) => ({
                ...prev,
                authUnavailable: false,
                dataLoadFailed: false,
                attempt: prev.attempt + 1,
              }));
            }}
            className="mt-5 inline-flex min-h-[2.75rem] items-center justify-center rounded-lg bg-primary px-5 text-body-sm font-semibold text-white hover:bg-primary-dark"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Dateline. Deliberately not a hero: this is a form, so the era belongs
          in the record rather than on a banner. */}
      <header className="border-b border-card-border bg-card-muted">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="text-heading font-semibold tracking-tight">New candidate</h1>
              {creationInfo ? (
                <p className="font-mono text-body-xs uppercase tracking-[0.14em] text-muted">
                  {creationInfo.gameDate}
                  <span className="mx-2 text-card-border">|</span>
                  world began {creationInfo.startDate}
                </p>
              ) : (
                <Skeleton className="h-3 w-56" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setFlow(!chatMode)}
              aria-pressed={chatMode}
              className="min-h-[2.75rem] shrink-0 rounded-full border border-card-border px-4 text-body-sm text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {chatMode ? "Show all steps" : "Try guided chat"}
            </button>
          </div>
          {/* The flavour text is the world's opening scene, written in the
              present tense of turn 1. Once the world has run on it is years out
              of date, so it is labelled with the date it describes rather than
              presented as the current situation. */}
          {creationInfo ? (
            creationInfo.flavorText && (
              <div className="mt-1.5 max-w-3xl">
                <p className="font-mono text-body-xs uppercase tracking-[0.14em] text-muted/70">
                  How it started &mdash; {creationInfo.flavorDate}
                </p>
                <p className="mt-1 text-body-sm leading-relaxed text-muted">
                  {creationInfo.flavorText}
                </p>
              </div>
            )
          ) : (
            <Skeleton className="mt-2 h-3 w-full max-w-2xl" />
          )}
        </div>
      </header>

      {discordGateModal}
      <form onSubmit={handleSubmit}>
        {chatMode ? (
          <ConversationShell
            steps={conversationSteps}
            renderStep={renderChatStep}
            alert={errorBanner}
            initialActiveId={chatProgress.activeId ?? undefined}
            initialReached={chatProgress.reached.length > 0 ? chatProgress.reached : undefined}
            onProgressChange={handleChatProgress}
          />
        ) : (
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
            {/* ── Working column ──────────────────────────────────────────── */}
            <div className="min-w-0 space-y-4">
              {errorBanner}

              {countryPanel}

              {politicianPanel}

              {regionPanel}

              {compassPanel}

              {partySelectorVisible && partyPanel}

              {/*
              The tutorial choice used to live here as a two-button row. It now
              runs as a full-screen two-question flow on first load after
              creation (see TutorialWelcome), where there is room to explain the
              options and where players actually read them.
            */}

              {statsPanel}

              {discordPanel}
            </div>

            {/* ── The file ────────────────────────────────────────────────── */}
            {/* Offset clears the app's 61px sticky navbar. */}
            <aside className="min-w-0 lg:sticky lg:top-[4.5rem]">{fileAside}</aside>
          </div>
        )}
      </form>

      <footer className="border-t border-card-border bg-card-muted">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <p className="text-body-xs text-muted">A House Divided &mdash; political simulation</p>
          <Link href="/dashboard" className="text-body-xs text-muted hover:text-foreground">
            Back to dashboard
          </Link>
        </div>
      </footer>
    </div>
  );
}
