import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSingleplayer: vi.fn(),
  gameState: vi.fn(),
  createManualSave: vi.fn(),
  listSaves: vi.fn(),
  deleteSave: vi.fn(),
  requestLoad: vi.fn(),
  writeSaveSettings: vi.fn(),
}));

vi.mock("@/lib/api/requireSingleplayer", () => ({
  requireSingleplayer: mocks.requireSingleplayer,
}));
vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(async () => ({ collection: () => ({ findOne: mocks.gameState }) })),
}));
vi.mock("@/lib/singleplayer/saves", async () => {
  const actual = await vi.importActual<typeof import("@/lib/singleplayer/saves")>(
    "@/lib/singleplayer/saves"
  );
  return {
    ...actual,
    createManualSave: mocks.createManualSave,
    listSaves: mocks.listSaves,
    deleteSave: mocks.deleteSave,
    requestLoad: mocks.requestLoad,
    writeSaveSettings: mocks.writeSaveSettings,
    readSaveSettings: vi.fn(async () => ({ autosaveEvery: 1 })),
    readSaveState: vi.fn(async () => ({ lastAutosaveError: { at: "t", message: "disk full" } })),
  };
});

import { SaveError } from "@/lib/singleplayer/saves";
import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";
import { POST as LOAD } from "./[id]/load/route";
import { PUT as SETTINGS } from "./settings/route";

const ID = "20261101T120000Z-abc123";
const req = (method: string, body?: unknown) =>
  new Request("http://127.0.0.1:3111/api/singleplayer/saves", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSingleplayer.mockReturnValue(null);
  mocks.gameState.mockResolvedValue({ isProcessing: false });
});

describe("singleplayer save routes", () => {
  it("answer 404 outside singleplayer before doing anything", async () => {
    const denied = new Response(null, { status: 404 });
    mocks.requireSingleplayer.mockReturnValue(denied);
    expect(await GET(req("GET"))).toBe(denied);
    expect(await POST(req("POST", {}))).toBe(denied);
    expect(await DELETE(req("DELETE"), ctx(ID))).toBe(denied);
    expect(await LOAD(req("POST"), ctx(ID))).toBe(denied);
    expect(await SETTINGS(req("PUT", { autosaveEvery: 2 }))).toBe(denied);
    expect(mocks.createManualSave).not.toHaveBeenCalled();
    expect(mocks.requestLoad).not.toHaveBeenCalled();
  });

  it("lists saves with the setting and the last autosave problem", async () => {
    mocks.listSaves.mockResolvedValue([{ id: ID }]);
    const body = await (await GET(req("GET"))).json();
    expect(body).toMatchObject({
      saves: [{ id: ID }],
      settings: { autosaveEvery: 1 },
      autosaveError: "disk full",
      lastLoad: null,
    });
  });

  it("creates a named save and reports a refusal in plain words", async () => {
    mocks.createManualSave.mockResolvedValueOnce({ id: ID, name: "x" });
    expect((await (await POST(req("POST", { name: "x" }))).json()).save.id).toBe(ID);
    mocks.createManualSave.mockRejectedValueOnce(new SaveError(409, "A turn is running."));
    const refused = await POST(req("POST", { name: "x" }));
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe("A turn is running.");
  });

  it("rejects ids that are not save ids", async () => {
    expect((await DELETE(req("DELETE"), ctx("../x"))).status).toBe(400);
    expect((await LOAD(req("POST"), ctx("../x"))).status).toBe(400);
    expect(mocks.deleteSave).not.toHaveBeenCalled();
  });

  it("deletes, and 404s a save that is gone", async () => {
    mocks.deleteSave.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await DELETE(req("DELETE"), ctx(ID))).status).toBe(200);
    expect((await DELETE(req("DELETE"), ctx(ID))).status).toBe(404);
  });

  it("queues a load without touching the world, and refuses mid-turn", async () => {
    mocks.requestLoad.mockResolvedValue({ id: ID });
    const ok = await LOAD(req("POST"), ctx(ID));
    expect(await ok.json()).toMatchObject({ ok: true, restartRequired: true });
    mocks.gameState.mockResolvedValue({ isProcessing: true });
    expect((await LOAD(req("POST"), ctx(ID))).status).toBe(409);
    expect(mocks.requestLoad).toHaveBeenCalledTimes(1);
  });

  it("validates the autosave interval", async () => {
    mocks.writeSaveSettings.mockResolvedValue({ autosaveEvery: 5 });
    expect((await SETTINGS(req("PUT", { autosaveEvery: 5 }))).status).toBe(200);
    expect((await SETTINGS(req("PUT", { autosaveEvery: -1 }))).status).toBe(400);
    expect((await SETTINGS(req("PUT", { autosaveEvery: "1" }))).status).toBe(400);
  });
});
