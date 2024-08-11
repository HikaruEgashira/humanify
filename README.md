# Humanify
> Deobfuscate Javascript code using LLMs ("AI")

This tool uses large language modeles (like ChatGPT & llama2) and other tools to
deobfuscate, unminify, transpile, decompile and unpack Javascript code. Note
that LLMs don't perform any structural changes – they only provide hints to
rename variables and functions. The heavy lifting is done by Babel on AST level
to ensure code stays 1-1 equivalent.

### ➡️ Check out the [introduction blog post][blogpost] for in-depth explanation!

[blogpost]: https://thejunkland.com/blog/using-llms-to-reverse-javascript-minification

## Example

Given the following minified code:

```javascript
function a(e,t){var n=[];var r=e.length;var i=0;for(;i<r;i+=t){if(i+t<r){n.push(e.substring(i,i+t))}else{n.push(e.substring(i,r))}}return n}
```

The tool will output a human-readable version:

```javascript
function splitString(inputString, chunkSize) {
  var chunks = [];
  var stringLength = inputString.length;
  var startIndex = 0;
  for (; startIndex < stringLength; startIndex += chunkSize) {
    if (startIndex + chunkSize < stringLength) {
      chunks.push(inputString.substring(startIndex, startIndex + chunkSize));
    } else {
      chunks.push(inputString.substring(startIndex, stringLength));
    }
  }
  return chunks;
}
```

🚨 **NOTE:** 🚨

Large files may take some time to process and use a lot of tokens if you use
ChatGPT. For a rough estimate, the tool takes about 2 tokens per character to
process a file:

```shell
echo "$((2 * $(wc -c < yourscript.min.js)))"
```

So for refrence: a minified `bootstrap.min.js` would take about $0.5 to
un-minify using ChatGPT.

## Getting started

You'll need to decide whether to use ChatGPT or llama2. In a nutshell:

* ChatGPT
  * Runs on someone else's computer that's specifically optimized for this kind
    of things
  * Costs money depending on the length of your code
  * Is more accurate
  * Is (probably) faster

See instructions below for each option:

### ChatGPT

You'll need a ChatGPT API key. You can get one by signing up at
https://openai.com/.

There are several ways to provide the API key to the tool:
```shell
OPENAI_TOKEN=your-token bunx @hikae/humanify -o deobfuscated.js obfuscated-file.js

bunx @hikae/humanify --key="your-token" -o deobfuscated.js obfuscated-file.js
```

Use your preferred way to provide the API key. Use `bunx @hikae/humanify --help` to see
all available options.

## Features

The main features of the tool are:
* Uses ChatGPT functions to get smart suggestions to rename variable and
  function names
* Uses custom and off-the-shelf Babel plugins to perform AST-level unmanging
* Uses Webcrack to unbundle Webpack bundles

## Contributing

If you'd like to contribute, please fork the repository and use a feature
branch. Pull requests are warmly welcome.

## Licensing

The code in this project is licensed under MIT license.
