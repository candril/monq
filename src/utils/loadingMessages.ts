/**
 * Randomised loading messages split by context.
 *
 * CONNECTION_MESSAGES — shown during credential fetch + initial DB connect.
 *   Vault, network, Azure, connection humour.
 *
 * DOCUMENT_MESSAGES — shown while fetching documents from an open collection.
 *   Query, schema, data humour. No vault/cloud references.
 */

const CONNECTION_MESSAGES = [
  // Vault / secrets
  "Bribing the key vault guardian…",
  "Whispering the secret passphrase to Azure…",
  "Picking the lock on the key vault…",
  "Sending a strongly-worded letter to the secret store…",
  "Negotiating with the credential daemon…",
  "Convincing the vault it's actually you…",
  "Asking the password manager very nicely…",
  "Stealing credentials from future self…",
  "Exchanging handshakes with the secret society…",
  "Rummaging through the digital junk drawer…",
  "Decoding the ancient scroll of connection strings…",
  "Unlocking the forbidden tome of database URIs…",

  // Network / connection
  "Sending carrier pigeons to the database server…",
  "Warming up the TCP hamsters…",
  "Untangling the network spaghetti…",
  "Pinging the database into existence…",
  "Convincing packets to travel at the speed of light…",
  "Bribing the router for a faster path…",
  "Establishing a psychic link with the server…",
  "Drawing a very detailed map to the database…",
  "Deploying highly trained network gnomes…",
  "Knocking on port 27017…",
  "Waiting for the server to put down its coffee…",
  "Spinning up the connection hamster wheel…",
  "Following the rainbow to the database endpoint…",
  "Trying to remember if VPN is on…",

  // MongoDB connection
  "Waking up the replica set…",
  "Counting the shards on your fingers…",
  "Asking the primary nicely to accept connections…",
  "Checking if the oplog has anything interesting…",
  "Convincing WiredTiger to open the cache…",
  "Dropping and recreating the connection (just kidding)…",

  // Azure / cloud
  "Waiting for Azure to finish its coffee break…",
  "Submitting a support ticket to get the password…",
  "Checking if the cloud region is having a moment…",
  "Verifying that the service principal hasn't expired…",
  "Renewing the managed identity's gym membership…",
  "Filling out the Azure portal CAPTCHA…",
  "Waiting 30 seconds for IAM to propagate…",
  "Confirming you are not a robot (you might be)…",
  "Rebooting the cloud (theoretically)…",
  "Applying for a Microsoft Azure support ticket…",
  "Reading the Azure docs (RIP)…",

  // Terminal / dev
  "Have you tried turning the database off and on again?…",
  "Checking Slack for a 'database is down' message…",
  "Mentally preparing for a production incident…",
  "Praying to the green circle god…",
]

const DOCUMENT_MESSAGES = [
  // Query / fetch
  "Reminding MongoDB what a B-tree is…",
  "Defragmenting the BSON stream…",
  "Hydrating the document store…",
  "Translating your vibes into BSON…",
  "Indexing your hopes and dreams…",
  "Running explain() on existence…",
  "Aggregating the universe into a single document…",
  "Performing $lookup on the meaning of life…",
  "Querying the void with { _id: ObjectId('…') }…",
  "Waiting for the cursor to stop blinking…",
  "Compacting your collection of regrets…",
  "Checking if _id is still unique in this timeline…",
  "Scanning the collection for full-table wisdom…",
  "Telling the query planner to use the index, trust me…",
  "Negotiating with the cursor timeout…",
  "Coercing the documents into neat little rows…",
  "Asking the secondary replica very politely…",
  "Paginating through the void…",
  "Deserialising your hopes into BSON objects…",
  "Applying the sort order nobody asked for…",

  // Schema / data observations
  "Secretly judging your schema design…",
  "Measuring schema flexibility with a rubber duck…",
  "Flattening nested arrays of nested arrays of nested arrays…",
  "Discovering a document with 47 nested subdocuments…",
  "Noticing an ObjectId from 1970 and being concerned…",
  "Finding a field named 'temp2_final_FINAL_v3'…",
  "Spotting a 16MB document and silently judging…",
  "Realising someone stored JSON as a string inside BSON…",
  "Counting the number of fields named 'data'…",
  "Noticing createdAt and updatedAt are identical on every doc…",
  "Wondering what 'legacy' means in this context…",
  "Counting nulls that could have been omitted…",

  // Existential / silly
  "What even is a database? Asking for a friend…",
  "Questioning the relational model…",
  "Considering switching to Postgres (not really)…",
  "Plotting the overthrow of SQL hegemony…",
  "Calculating the airspeed velocity of an unladen query…",
  "Loading… (this is fine)…",
  "Pretending to do something useful…",
  "Sacrificing a test document to the demo gods…",
  "Checking if anyone is using production right now…",
  "Verifying that null !== undefined (it depends)…",
  "Blaming the intern for the missing index…",
  "Questioning your life choices that led to this schema…",
  "Appreciating the beauty of eventually consistent data…",
  "Wondering if NoSQL was a mistake…",
  "Debating whether to embed or reference…",
  "Normalising the data (lol, just kidding)…",
  "Denormalising everything (there we go)…",
  "Googling 'mongodb find all documents' for the 400th time…",
]

function pick(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!
}

/** For credential fetch + initial DB connection. */
export function randomConnectionMessage(): string {
  return pick(CONNECTION_MESSAGES)
}

/** For document fetching inside an open collection. */
export function randomDocumentMessage(): string {
  return pick(DOCUMENT_MESSAGES)
}

/** @deprecated use randomConnectionMessage or randomDocumentMessage */
export function randomLoadingMessage(): string {
  return randomConnectionMessage()
}
