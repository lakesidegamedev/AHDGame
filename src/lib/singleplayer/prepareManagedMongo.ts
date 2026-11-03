import { MongoClient, type Admin } from "mongodb";
import { assertSingleplayerAllowed } from "@/lib/singleplayer";

const REPLICA_SET = "ahd-local";

/** Initialize only the loopback mongod owned by the singleplayer launcher.
 * Existing data stays in place. External/hosted Mongo is never reconfigured.
 */
export async function prepareManagedMongo(uri: string): Promise<void> {
  assertSingleplayerAllowed();
  const address = new URL(uri);
  if (address.protocol !== "mongodb:" || address.hostname !== "127.0.0.1")
    throw new Error("Managed singleplayer MongoDB must use loopback.");
  const client = new MongoClient(uri, {
    directConnection: true,
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 5_000,
  });
  try {
    await client.connect();
    await initializeLocalReplicaSet(client.db("admin").admin(), address.host);
  } finally {
    await client.close();
  }
}

const MISMATCH_MESSAGE =
  "The local replica set configuration does not match this launch and is not a single-node local set.";
// replSetGetStatus code when this node is not in its own saved configuration.
const NOT_A_MEMBER = 93;
const NOT_YET_INITIALIZED = 94;

/**
 * The desktop client picks a free MongoDB port every time it opens a world, but
 * the replica set stores the address it first ran on. On any later start the
 * node no longer finds itself in that configuration and refuses to serve
 * (status 93). The set has exactly one member and the data is local, so the
 * safe repair is to point that member at the current address.
 */
async function moveSingleNodeSetToHost(admin: Pick<Admin, "command">, host: string) {
  const { config } = await admin.command({ replSetGetConfig: 1 });
  if (config?._id !== REPLICA_SET || config.members?.length !== 1)
    throw new Error(MISMATCH_MESSAGE);
  config.members[0].host = host;
  config.version = (config.version ?? 1) + 1;
  await admin.command({ replSetReconfig: config, force: true });
}

async function initiateLocalSet(admin: Pick<Admin, "command">, host: string) {
  try {
    await admin.command({ replSetInitiate: { _id: REPLICA_SET, members: [{ _id: 0, host }] } });
  } catch (initError) {
    // Another server worker may win first initialization.
    if ((initError as { code?: number }).code !== 23) throw initError;
  }
}

export async function initializeLocalReplicaSet(
  admin: Pick<Admin, "command">,
  host: string
): Promise<void> {
  try {
    const status = await admin.command({ replSetGetStatus: 1 });
    if (
      status.set !== REPLICA_SET ||
      status.members?.length !== 1 ||
      status.members[0].name !== host
    )
      throw new Error(MISMATCH_MESSAGE);
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === NOT_A_MEMBER) await moveSingleNodeSetToHost(admin, host);
    else if (code === NOT_YET_INITIALIZED) await initiateLocalSet(admin, host);
    else throw error;
  }
  const deadline = performance.now() + 30_000;
  do {
    const hello = await admin.command({ hello: 1 });
    if (hello.isWritablePrimary && hello.setName === REPLICA_SET) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (performance.now() < deadline);
  throw new Error("The local database did not elect its primary within 30 seconds.");
}
