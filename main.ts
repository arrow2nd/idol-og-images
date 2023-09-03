import { DOMParser } from "deno-dom-wasm";

type Value = {
  value: string;
};

type Binding = {
  名前: Value;
  URL: Value;
};

type ImasparqlResponse = {
  results: {
    bindings: Binding[];
  };
};

type IdolImage = {
  name: string;
  url: string;
};

const data = Deno.readTextFileSync("./docs/data.json");
const json = await JSON.parse(data) as IdolImage[];

/**
 * OGP画像のURLを取得
 * @param url URL
 * @returns 画像URL
 */
async function fetchOgpImageUrl(url: string): Promise<string> {
  const res = await fetch(url).catch((err) => {
    throw new Error(
      `[Error] ${err.response.statusText} : ${err.response.status}`,
    );
  });

  const body = await res.text();
  const doc = new DOMParser().parseFromString(body, "text/html");
  if (!doc) {
    return "";
  }

  const ogImage = doc.querySelector('head > meta[property="og:image"]');
  if (!ogImage) {
    return "";
  }

  return ogImage.getAttribute("content") ?? "";
}

/**
 * imasparqlからデータを取得
 * @param query クエリ
 * @returns 検索結果
 */
async function fetchFromImasparql<T>(query: string): Promise<T> {
  const url = new URL("https://sparql.crssnky.xyz/spql/imas/query?output=json");

  // クエリから空白・改行を削除
  const trimedQuery = query.replace(/[\n\r\s]/g, " ");
  url.searchParams.append("query", trimedQuery);

  // 5sでタイムアウト
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 5000);

  const res = await fetch(url.toString(), { signal: ctrl.signal }).catch(
    (err) => {
      throw new Error(
        `[Error] im@sparqlにアクセスできません (${err.response.status})`,
      );
    },
  );

  clearTimeout(id);

  if (!res.ok) {
    throw new Error("[Error] 取得に失敗しました");
  }

  return await res.json();
}

const query = `
PREFIX imas: <https://sparql.crssnky.xyz/imasrdf/URIs/imas-schema.ttl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?名前 ?URL
WHERE {
  ?data rdfs:label ?名前;
  imas:IdolListURL ?URL.
}
ORDER BY ?名前
`;

const res = await fetchFromImasparql<ImasparqlResponse>(query);

for (const binding of res.results.bindings) {
  const name = binding.名前.value;

  // 取得済みならスキップ
  if (json.find((image) => image.name === name) || !binding.URL) {
    console.log(`[SKIP] ${name}`);
    continue;
  }

  // OGP画像のURLを取得
  const url = await fetchOgpImageUrl(binding.URL?.value);

  // 2秒待機
  await new Promise((resolve) => setTimeout(resolve, 2000));

  json.push({ name, url });
  console.log(`[ADDED] ${name} -> ${url}`);
}

const out = JSON.stringify(
  json.sort((a, b) => a.name.localeCompare(b.name, "ja")),
  null,
  "\t",
);

Deno.writeTextFileSync("./docs/data.json", out);

console.log("[SUCCESS]");
