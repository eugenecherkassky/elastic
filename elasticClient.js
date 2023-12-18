const { Client } = require("@elastic/elasticsearch");
const { Readable } = require("stream");

const BUNCH_SIZE = 1001; // + 1 in order not to make extra call to figure out of the next page exists
const MAX_RESULT_WINDOW = 10000;

const getRandomElementFromArray = (values) => {
  const i = Math.floor(Math.random() * values.length);

  return values[i];
};

class HttpError extends Error {
  status;

  constructor(status, message) {
    super(message);

    this.status = status;
  }
}

class ElasticClient {
  nodes = [];

  constructor(nodes) {
    this.nodes = nodes;
  }

  async search(params) {
    const client = await this.create();

    return client.search(params);
  }

  searchBunch(params) {
    if (this.isInMaxResultWindow(params)) {
      delete params.body?.search_after;
    } else {
      if (!Array.isArray(params.body.search_after)) {
        throw new Error(`Bad request: ${JSON.stringify(params)}`);
      }

      delete params.from;
    }

    return Readable.from(this.searchBunchGenerator(params));
  }

  async searchWithThrow(params) {
    return this.search(params)
      .then((res) => {
        if (res.body._shards.failures?.length) {
          res.body._shards.failures.forEach((failure) => {
            console.log(
              "Elastic backend failure",
              JSON.stringify(failure),
              JSON.stringify(params)
            );
          });

          throw new HttpError(502, "Elastic backend failure");
        }

        return res;
      })
      .catch((err) => {
        console.log(
          "Elastic backend failure",
          JSON.stringify(err),
          JSON.stringify(params)
        );

        throw new HttpError(502, "Elastic backend failure");
      });
  }

  async create() {
    const elasticAddr = await this.getElasticAddr();

    console.log("node:", elasticAddr);

    return new Client({
      node: {
        url: new URL(elasticAddr),
        ssl: { rejectUnauthorized: false },
      },
    });
  }

  isInMaxResultWindow({ from = 0, size = 0 }) {
    if (from === 0) {
      return true;
    }

    return from + size < MAX_RESULT_WINDOW;
  }

  async getElasticAddr() {
    return getRandomElementFromArray(this.nodes);
  }

  async *searchBunchGenerator(params) {
    let foundHits = 0;

    const searchParams = { ...params };
    const from = params.from || 0;

    while (true) {
      searchParams.size = params.size
        ? Math.min(params.size - foundHits, BUNCH_SIZE)
        : BUNCH_SIZE;

      // no need to find
      if (searchParams.size === 0) {
        break;
      }

      console.log("bunchParams", JSON.stringify(searchParams));

      const { body } = await this.searchWithThrow(searchParams);

      for (const hit of body.hits.hits) {
        yield hit;
      }

      // no more hits
      if (body.hits.hits.length !== searchParams.size) {
        break;
      }

      foundHits += body.hits.hits.length;

      searchParams.from = from + foundHits;

      if (!this.isInMaxResultWindow(searchParams)) {
        const { sort } = body.hits.hits.pop();

        searchParams.body.search_after = sort;
        delete searchParams.from;
      }
    }
  }
}

module.exports = ElasticClient;
