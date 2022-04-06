import express, { Request, response, Response } from "express";
import Queue from "promise-queue";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { Signal } from "signal-ts";

const PORT = process.env.PORT || 5000;

const app = express();
const acknowledgementSignal = new Signal<string>();
const acknowledgement = async ({ refreshKey, timeout = 1000 }: { refreshKey: string, timeout: number }) => {
  await new Promise((resolve, reject) => {
    const onSignal = (_refreshKey: string) => {
      console.log("refreshKey: ", refreshKey);
      console.log("_refreshKey: ", _refreshKey);
      if (refreshKey === _refreshKey) {
        acknowledgementSignal.remove(onSignal);
        resolve(true);
      }
    };
    acknowledgementSignal.add(onSignal);
    setTimeout(() => {
      acknowledgementSignal.remove(onSignal);
      reject();
    }, timeout);
  });
};

const acknowledgementHandler = (req: Request, res: Response) => {
  console.log("*****************")
  console.log("ack!!!")
  console.log("*****************")
  acknowledgementSignal.emit(req.params.refreshKey);
  res.status(200).end();
}

const queue = new Queue(1);
const createNumGenerator = async function* ({
  shouldContinue,
  streamId,
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
    const nextNum = await queue.add(getNextNum);
    yield nextNum;
  }
  console.log(`${streamId} diskIoTime: `, diskIoTime);
};

const streamHandler = async (req: Request, res: Response) => {
  const requestId = uuidv4();
  const size = parseInt(req.params.size) || Infinity;
  const streamState = { connected: true, sentAmount: 0, sentSinceLastPing: 0 };
  const onConnectionClose = () => {
    streamState.connected = false;
    console.log(`request ${requestId} closed!`);
    res.removeListener("close", onConnectionClose);
  };
  res.addListener("close", onConnectionClose);

  const numGenerator = createNumGenerator({
    streamId: requestId,
    shouldContinue: () =>
      streamState.connected && streamState.sentAmount < size,
  });

  streamIteration: for await (const num of numGenerator) {
    console.log(`num sent to request ${requestId}:`, num);
    res.write(`${num}|`);
    streamState.sentAmount++;
    streamState.sentSinceLastPing++;
    if (streamState.sentSinceLastPing === 10000) {
      const refreshKey = uuidv4()
      res.write(`ping:${refreshKey}|`);
      try {
        await acknowledgement({ refreshKey, timeout: 1000 });
        streamState.sentSinceLastPing = 0;
      } catch {
        console.log(`did no receive status acknowledgement from request ${requestId}`)
        break streamIteration;
      }
    }
  }

  res.end();
};


app.get("/ack/:refreshKey", acknowledgementHandler);
app.get("/stream", streamHandler);
app.get("/stream/:size", streamHandler);
app.use("/", express.static("./static"));

app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
