import { readFile, writeFile } from "node:fs/promises";

const files = [
  "src/roles.js",
  "src/players.js",
  "src/ai.js",
  "src/nightActions.js",
  "src/voting.js",
  "src/gameEngine.js",
  "src/saveData.js",
  "src/ui.js",
  "src/main.js"
];

const chunks = [];
for (const file of files) {
  let code = await readFile(file, "utf8");
  code = code
    .replace(/^import .*?;\r?\n/gm, "")
    .replace(/^export /gm, "");
  chunks.push(`\n/* ${file} */\n${code}`);
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Midnight Verdict</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script>
${chunks.join("\n")}
    </script>
  </body>
</html>
`;

await writeFile("index.html", html);
console.log("Built standalone index.html");
