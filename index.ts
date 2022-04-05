import express from "express";
import Queue from "promise-queue";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

const PORT = process.env.PORT || 5000;

const app = express();

const queue = new Queue(1);
const createNumStream = async function* ({
  shouldContinue,
  streamId
}: {
  shouldContinue: () => boolean;
  streamId: string;
}) {
  let diskIoTime = 0;
  const getNextNum = async () => {
    const startTime = Date.now();
    const { num } = JSON.parse(await fs.readFile("./state.json", "utf-8")) as {
      num: number;
    };
    await fs.writeFile(
      "./state.json",
      JSON.stringify({ num: num + 1 }),
      "utf-8"
    );
    diskIoTime += Date.now() - startTime;
    return num;
  };

  while (shouldContinue()) {
    const nextNum = await queue.add<number>(getNextNum);
    yield nextNum;
  }
  console.log(`${streamId} diskIoTime: `, diskIoTime)
};

const streamHandler = async (req, res) => {
  const requestId = uuidv4();
  const size = parseInt(req.params.size) || Infinity;
  const streamState = { connected: true, sentAmount: 0 };
  const onConnectionClose = () => {
    streamState.connected = false;
    console.log(`request ${requestId} closed!`);
    res.removeListener("close", onConnectionClose);
  };
  res.addListener("close", onConnectionClose);

  const stream = createNumStream({
    streamId: requestId,
    shouldContinue: () =>
      streamState.connected && streamState.sentAmount < size,
  });

  for await (const num of stream) {
    console.log(`num sent to request ${requestId}:`, num);
    res.write(`${num}|`);
    streamState.sentAmount++;
  }

  res.end();
};

app.get("/stream", streamHandler);
app.get("/stream/:size", streamHandler);
app.use("/", express.static("./static"));

app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
