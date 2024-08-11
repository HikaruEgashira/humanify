#!/usr/bin/env tsx
import fs from "fs/promises";
import prettier from "./prettier.js";
import openai from "./openai/openai.js";
import humanify from "./humanify.js";
import yargs from "yargs/yargs";
import { ensureFileExists } from "./fs-utils.js";
import { env } from "./env.js";
import { webcrack } from "./webcrack.js";

const argv = yargs(process.argv.slice(2))
  .example(
    "npm start -o example-formatted.js example.js",
    "Format example.js and save to example-formatted.js",
  )
  .scriptName("@hikae/humanify")
  .command("<file>", "File to format")
  .options({
    output: {
      type: "string",
      alias: "o",
      description: "Output file",
      require: true,
    },
    key: {
      type: "string",
      alias: "openai-key",
      description:
        "OpenAI key (defaults to OPENAI_API_KEY environment variable)",
    },
  })
  .demandCommand(1)
  .help()
  .parseSync();

const filename = argv._[0] as string;

await ensureFileExists(filename);

const bundledCode = await fs.readFile(filename, "utf-8");

const PLUGINS = [
  humanify,
  openai({ apiKey: argv.key ?? env("OPENAI_API_KEY") }),
  prettier,
];

const extractedFiles = await webcrack(bundledCode, argv.output);

for (const file of extractedFiles) {
  if (file.path.endsWith("deobfuscated.js")) continue;

  console.log(`deobfuscating: ${file.path}`);
  const code = await fs.readFile(file.path, "utf-8");
  const formattedCode = await PLUGINS.reduce(
    (p, next) => p.then(next),
    Promise.resolve(code),
  );

  await fs.writeFile(file.path, formattedCode);
  console.log(`deobfuscated: ${file.path}`);
}

process.exit(0); // Kills the zeromq socket
