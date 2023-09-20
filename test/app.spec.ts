import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import axios from "axios";
import {faker} from "@faker-js/faker";
import {TransformData} from "./fixtures/dtos/transform-data.dto";
import {FLOWCORE_CONSTANT_TIME_BUCKET_FORMAT} from "./fixtures/constants";
import _ from "lodash";
import express from "express";
import {Server} from "http";
import {TransformerBlueprint} from "./fixtures/dtos/transformer-blueprint.dto";
import * as fs from "fs";
import * as path from "path";
import waitForExpect from "wait-for-expect";


dayjs.extend(utc);

const TRANSFORMER_BLUEPRINT: TransformerBlueprint = {
  name: "test-transformer",
  version: "1.0.0",
  runtime: "node",
  artifactUrl: "/app/transformers/test-transformer",
  entrypoint: "main.js",
  startTimeTimeout: 10000,
} as TransformerBlueprint;

const receiverPort = 40300;

describe("NodeJS Test Transformer (e2e)", () => {
  jest.setTimeout(1000000);
  const listeners = new Map<string, jest.MockedFn<any>>();
  const app = express();
  let server: Server;
  let processId: string;

  beforeAll(async () => {
    app.use(express.json());

    app.post("/store/:name", (req, res) => {
      console.log("Received payload", req.params.name, req.body);
      listeners.get(req.params.name)!(req.body);
      res.status(201).send();
    });

    app.get("/health", (req, res) => {
      res.send("OK");
    });

    server = app.listen(receiverPort, () => {
      console.log(`Receiver started on port ${receiverPort}`);
    });

    await waitForExpect(async () => {
      const healthResponse =
        await axios.get(`http://localhost:${receiverPort}/health`);
      expect(healthResponse.status).toEqual(200);
    });

    try {
      const axiosResponse = await axios.post(
        "http://localhost:3001/load",
        TRANSFORMER_BLUEPRINT,
      );

      expect(axiosResponse.data.processId).toBeDefined();

      processId = axiosResponse.data.processId;
    }
    catch (e) {
      console.log("Error loading transformer", e);
    }

  });

  it("should load and process data through a transformer", async () => {
    const receiverName = _.kebabCase(faker.word.noun().toLowerCase());
    const jestFn = jest.fn();
    listeners.set(receiverName, jestFn);

    const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "expected.json"), "utf-8")) as { input: any, output: any }[];

    const definition = {
      hello: "world",
    };

    for (const expectedConfiguration of expected) {
      const eventTime = dayjs.utc(faker.date.recent());
      const data: TransformData = {
        destination: `http://${process.env.HOST_ADDRESS}:${receiverPort}/store/${receiverName}`,
        definition,
        event: {
          eventId: faker.string.uuid(),
          dataCore: faker.string.uuid(),
          eventType: faker.word.noun(),
          aggregator: faker.word.adjective(),
          timeBucket: eventTime.format(FLOWCORE_CONSTANT_TIME_BUCKET_FORMAT),
          validTime: eventTime.toISOString(),
          serializedPayload: JSON.stringify(expectedConfiguration.input),
        },
      };

      const processedResult = await axios.post(
        "http://localhost:3001/transform/" + processId,
        data,
      );

      expect(processedResult.status).toEqual(200);
    }

    for (const expectedConfiguration of expected) {
      const data:{
        [key: string]: any
      } = {};

      for (const key of Object.keys(expectedConfiguration.output)) {
        if (expectedConfiguration.output[key] === ":uuid:") {
          data[key] = expect.any(String);
          continue;
        }

        if (expectedConfiguration.output[key] === ":date:") {
          data[key] = expect.any(String);
          continue;
        }
        data[key] = expectedConfiguration.output[key];
      }

      expect(jestFn.mock.calls).toEqual(expect.arrayContaining([[expect.objectContaining({
        value: data,
      })]]));
    }
  });

  afterAll(async () => {
    console.log("Unloading transformer", processId);
    try {
      await axios.post("http://localhost:3001/unload/" + processId);
    } catch (e) {
      console.log("Error unloading transformer", e);
    }
    server.close();
  });
});
