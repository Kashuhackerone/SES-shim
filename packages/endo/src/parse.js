/* global StaticModuleRecord */

import { parseRequires } from "./parse-requires.js";
import { parseExtension } from "./extension.js";

const { entries, freeze, fromEntries } = Object;

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

// TODO: parsers should accept bytes and perhaps even content-type for
// verification.

export const parseMjs = (source, location) => {
  return new StaticModuleRecord(source, location);
};

export const parseCjs = (source, location) => {
  if (typeof source !== "string") {
    throw new TypeError(
      `Cannot create CommonJS static module record, module source must be a string, got ${source}`
    );
  }
  if (typeof location !== "string") {
    throw new TypeError(
      `Cannot create CommonJS static module record, module location must be a string, got ${location}`
    );
  }

  const imports = parseRequires(source, location);
  const execute = (exports, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`
    );

    let moduleExports = exports;

    const module = freeze({
      get exports() {
        return moduleExports;
      },
      set exports(namespace) {
        moduleExports = namespace;
        exports.default = namespace;
      }
    });

    const require = freeze(importSpecifier => {
      const namespace = compartment.importNow(resolvedImports[importSpecifier]);
      if (namespace.default !== undefined) {
        return namespace.default;
      }
      return namespace;
    });

    functor(
      require,
      exports,
      module,
      location, // __filename
      new URL("./", location).toString() // __dirname
    );
  };
  return freeze({ imports, execute });
};

export const parseJson = (source, location) => {
  const imports = freeze([]);
  const execute = exports => {
    try {
      exports.default = JSON.parse(source);
    } catch (error) {
      throw new SyntaxError(
        `Cannot parse JSON module at ${location}, ${error}`
      );
    }
  };
  return freeze({ imports, execute });
};

export const makeExtensionParser = extensions => {
  return (source, location) => {
    const extension = parseExtension(location);
    if (!hasOwnProperty.call(extensions, extension)) {
      throw new Error(
        `Cannot parse module at ${location}, no parser configured for that extension`
      );
    }
    const parse = extensions[extension];
    return parse(source, location);
  };
};

const parserForLanguage = {
  mjs: parseMjs,
  cjs: parseCjs,
  json: parseJson
};

export const mapParsers = parsers => {
  const parserForExtension = [];
  const errors = [];
  for (const [extension, language] of entries(parsers)) {
    if (hasOwnProperty.call(parserForLanguage, language)) {
      const parser = parserForLanguage[language];
      parserForExtension.push([extension, parser]);
    } else {
      errors.push(`${q(language)} for extension ${q(extension)}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`No parser available for language: ${errors.join(", ")}`);
  }
  return makeExtensionParser(fromEntries(parserForExtension));
};