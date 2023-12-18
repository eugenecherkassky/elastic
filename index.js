const readline = require("readline");
const keypress = require("keypress");

const ElasticClient = require("./elasticClient");

// TODO, update servers
const servers = [
  "http://localhost:9200",
  "http://localhost:9201",
  "http://localhost:9202",
  "http://localhost:9203",
];

const search = async (params) => {
  try {
    console.log(
      "\n------------------------------------------------------------------\n"
    );
    const stream = await client.searchBunch(params);

    const result = [];

    for await (const entity of stream) {
      result.push(entity);
    }

    return result;
  } catch (e) {
    console.log("error", e);
  }
};

const client = new ElasticClient(servers);

const params = {
  body: {
    query: {
      match_all: {},
    },
    sort: {
      timestamp: {
        order: "desc",
      },
    },
  },
  from: 0,
  size: 1000,
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

keypress(process.stdin);

let result = [];
const sorts = [];

process.stdin.on("keypress", async (_ch, key) => {
  if (!key) {
    return;
  }

  if (key.name === "escape") {
    console.log("Exiting...");
    process.exit();
  }

  if (key.name === "left") {
    params.from = Math.max(
      params.from - Math.min(params.size, result.length),
      0
    );
    params.body.search_after = sorts.pop();
  }

  if (key.name === "right") {
    params.from = params.from + result.length;

    if (result.length) {
      const { sort } = result[result.length - 1];

      sorts.push(sort);

      params.body.search_after = sort;
    }
  }

  if (["left", "right"].indexOf(key.name) !== -1) {
    result = await search({ ...params });

    if (result.length) {
      console.log("result", key.name, result[0], result[result.length - 1]);
    } else {
      console.log("result", key.name, "no items");
    }
  }
});

process.stdin.setRawMode(true);
process.stdin.resume();

console.log("Press <-, ->, or Esc to exit.");
