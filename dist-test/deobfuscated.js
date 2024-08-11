#!/usr/bin/env node
import fs from "fs/promises";
import prettier$1 from "prettier";
import OpenAI from "openai";
import { encode } from "gpt-3-encoder";
import { transform } from "@babel/core";
import * as t from "@babel/types";
import yargs from "yargs/yargs";
import path, { resolve } from "path";
import dotenv from "dotenv";
import { webcrack as webcrack$1 } from "webcrack";
var prettier = async code => prettier$1.format(code, {
  parser: "babel"
});
const START_NEXT_CODE_BLOCK_AT_FRACTION = 1 / 5 * 4;
const SOFT_LIMIT_FRACTION = 1 / 4;
const HARD_LIMIT_FRACTION = 1 / 3;
async function splitCode(code) {
  console.log("Splitting code into blocks");
  let codeBlocks = [];
  let currentCode = code;
  const numTokensForRequestAndResponse = 128000;
  const tokenSoftLimit = numTokensForRequestAndResponse * SOFT_LIMIT_FRACTION;
  const tokenHardLimit = numTokensForRequestAndResponse * HARD_LIMIT_FRACTION;
  while (currentCode.length > 0) {
    const {
      removedCode,
      remainingCode
    } = removeCodeWithLimits(currentCode, {
      softLimit: tokenSoftLimit,
      hardLimit: tokenHardLimit
    });
    codeBlocks.push(removedCode);
    currentCode = remainingCode;
  }
  console.log(`Splitted code ${codeBlocks.length} blocks`);
  return codeBlocks;
}
function removeCodeWithLimits(code, limits) {
  let stopAt = code.length;
  let lastStopOver = stopAt;
  while (true) {
    const codeSlice = code.slice(0, stopAt);
    const numTokens = encode(codeSlice).length;
    if (numTokens > limits.hardLimit) {
      lastStopOver = stopAt;
      stopAt = Math.max(stopAt / 2);
      continue;
    }
    if (numTokens < limits.softLimit) {
      if (stopAt === lastStopOver) {
        break;
      }
      stopAt = Math.max(stopAt + (lastStopOver - stopAt) / 2);
      continue;
    }
    break;
  }
  let removedCode = code.slice(0, stopAt);
  let remainingCode = stopAt === lastStopOver ? "" : code.slice(stopAt * START_NEXT_CODE_BLOCK_AT_FRACTION);
  return {
    removedCode,
    remainingCode
  };
}
const transformWithPlugins = async (code, plugins) => {
  return await new Promise((resolve, reject) => transform(code, {
    plugins,
    compact: false,
    minified: false,
    comments: false,
    sourceMaps: false,
    retainLines: false
  }, (err, result) => {
    if (err || !result) {
      reject(err);
    } else {
      resolve(result.code);
    }
  }));
};
const RESERVED_WORDS = ["abstract", "arguments", "await", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "debugger", "default", "delete", "do", "double", "else", "enum", "eval", "export", "extends", "false", "final", "finally", "float", "for", "function", "goto", "if", "implements", "import", "in", "instanceof", "int", "interface", "let", "long", "native", "new", "null", "package", "private", "protected", "public", "return", "short", "static", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "true", "try", "typeof", "var", "void", "volatile", "while", "with", "yield"];
function isReservedWord(word) {
  return RESERVED_WORDS.includes(word);
}
async function renameVariablesAndFunctions(code, toRename) {
  return await transformWithPlugins(code, [{
    visitor: {
      Identifier: path => {
        const rename = toRename.find(r => r.name === path.node.name);
        if (rename) {
          path.node.name = isReservedWord(rename.newName) ? `${rename.newName}$` : rename.newName;
        }
      }
    }
  }]);
}
async function mapPromisesParallel(numParallel, items, fn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const result = await fn(items[currentIndex], currentIndex);
      results.push(result);
    }
  }
  const workers = Array.from({
    length: numParallel
  }, worker);
  await Promise.all(workers);
  return results;
}
var openai = ({
  apiKey
}) => {
  const client = new OpenAI({
    apiKey
  });
  return async code => {
    const codeBlocks = await splitCode(code);
    let variablesAndFunctionsToRename = [];
    await mapPromisesParallel(10, codeBlocks, async codeBlock => {
      const renames = await codeToVariableRenames(codeBlock);
      variablesAndFunctionsToRename = variablesAndFunctionsToRename.concat(renames);
    });
    console.log(variablesAndFunctionsToRename);
    return renameVariablesAndFunctions(code, variablesAndFunctionsToRename);
  };
  async function codeToVariableRenames(code) {
    const chatCompletion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      tools: [{
        function: {
          name: "rename_variables_and_functions",
          description: "Rename variables and function names in Javascript code",
          parameters: {
            type: "object",
            properties: {
              variablesAndFunctionsToRename: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "The name of the variable or function name to rename"
                    },
                    newName: {
                      type: "string",
                      description: "The new name of the variable or function name"
                    }
                  },
                  required: ["name", "newName"]
                }
              }
            },
            required: ["variablesToRename"]
          }
        },
        type: "function"
      }],
      messages: [{
        role: "assistant",
        content: "Rename all Javascript variables and functions to have descriptive names based on their usage in the code."
      }, {
        role: "user",
        content: code
      }]
    });
    const data = chatCompletion.choices[0];
    console.log(data);
    if (!data.message.tool_calls) {
      return [];
    }
    const {
      variablesAndFunctionsToRename
    } = JSON.parse(fixPerhapsBrokenResponse(data.message?.tool_calls[0].function.arguments));
    return variablesAndFunctionsToRename;
  }
};
function fixPerhapsBrokenResponse(jsonResponse) {
  return jsonResponse.replace(/},\s*]/im, "}]");
}
const convertVoidToUndefined = {
  visitor: {
    // Convert void 0 to undefined
    UnaryExpression(path) {
      if (path.node.operator === "void" && path.node.argument.type === "NumericLiteral") {
        path.replaceWith({
          type: "Identifier",
          name: "undefined"
        });
      }
    }
  }
};
const flipComparisonsTheRightWayAround = {
  visitor: {
    // If a variable is compared to a literal, flip the comparison around so that the literal is on the right-hand side
    BinaryExpression(path) {
      const node = path.node;
      const mappings = {
        "==": "==",
        "!=": "!=",
        "===": "===",
        "!==": "!==",
        "<": ">",
        "<=": ">=",
        ">": "<",
        ">=": "<="
      };
      if (t.isLiteral(node.left) && !t.isLiteral(node.right) && mappings[node.operator]) {
        path.replaceWith({
          ...node,
          left: node.right,
          right: node.left,
          operator: mappings[node.operator]
        });
      }
    }
  }
};
const makeNumbersLonger = {
  visitor: {
    // Convert 5e3 to 5000
    NumericLiteral(path) {
      if (typeof path.node.extra?.raw === "string" && path.node.extra?.raw?.includes("e")) {
        path.replaceWith({
          type: "NumericLiteral",
          value: Number(path.node.extra.raw)
        });
      }
    }
  }
};
var humanify = async code => transformWithPlugins(code, [convertVoidToUndefined, flipComparisonsTheRightWayAround, makeNumbersLonger, "transform-beautifier"]);
const ensureFileExists = async path => {
  try {
    await fs.access(path);
  } catch (e) {
    const fullPath = resolve(path);
    console.error(`File ${fullPath} does not exist`);
    process.exit(1);
  }
};
dotenv.config();
function env(name, fallback) {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}
async function webcrack(code, outDir) {
  const cracked = await webcrack$1(code);
  await cracked.save(outDir);
  const output = await fs.readdir(outDir);
  return output.filter(file => file.endsWith(".js")).map(file => ({
    path: path.join(outDir, file)
  }));
}
const argv = yargs(process.argv.slice(2)).example("npm start -o example-formatted.js example.js", "Format example.js and save to example-formatted.js").scriptName("@hikae/humanify").command("<file>", "File to format").options({
  output: {
    type: "string",
    alias: "o",
    description: "Output file",
    require: true
  },
  key: {
    type: "string",
    alias: "openai-key",
    description: "OpenAI key (defaults to OPENAI_API_KEY environment variable)"
  }
}).demandCommand(1).help().parseSync();
const filename = argv._[0];
await ensureFileExists(filename);
const bundledCode = await fs.readFile(filename, "utf-8");
const PLUGINS = [humanify, openai({
  apiKey: argv.key ?? env("OPENAI_API_KEY")
}), prettier];
const extractedFiles = await webcrack(bundledCode, argv.output);
for (const file of extractedFiles) {
  if (file.path.endsWith("deobfuscated.js")) {
    continue;
  }
  console.log(`deobfuscating: ${file.path}`);
  const code = await fs.readFile(file.path, "utf-8");
  const formattedCode = await PLUGINS.reduce((p, next) => p.then(next), Promise.resolve(code));
  await fs.writeFile(file.path, formattedCode);
  console.log(`deobfuscated: ${file.path}`);
}
process.exit(0);