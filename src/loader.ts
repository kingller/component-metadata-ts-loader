import webpack from "webpack";
import * as ts from "typescript";
import path from "path";
import fs from "fs";
// TODO: Import from "react-docgen-typescript" directly when
// https://github.com/styleguidist/react-docgen-typescript/pull/104 is hopefully
// merged in. Will be considering to make a peer dependency as that point.
import {
  withDefaultConfig,
  withCustomConfig,
  withCompilerOptions,
  ParserOptions,
  FileParser
} from "react-docgen-typescript/lib/parser.js";
import LoaderOptions from "./LoaderOptions";
import validateOptions from "./validateOptions";
import { getOptions } from "loader-utils";

export interface TSFile {
  text?: string;
  version: number;
}

let languageService: ts.LanguageService | null = null;
const files: Map<string, TSFile> = new Map<string, TSFile>();

export default function loader(
  this: webpack.loader.LoaderContext
  // source: string,
) {
  // Loaders can operate in either synchronous or asynchronous mode. Errors in
  // asynchronous mode should be reported using the supplied callback.

  // Will return a callback if operating in asynchronous mode.
  const callback = this.async();

  try {
    // const newSource = processResource(this, source);
    const newSource = processResource(this);

    if (!callback) return newSource;
    callback(null, `module.exports = ${JSON.stringify(newSource)}`);
    return;
  } catch (e) {
    if (callback) {
      callback(e);
      return;
    }
    throw e;
  }
}

function processResource(
  context: webpack.loader.LoaderContext
  // source: string,
): object {
  // Mark the loader as being cacheable since the result should be
  // deterministic.
  context.cacheable(true);

  const options: LoaderOptions = getOptions(context) || {};
  validateOptions(options);

  options.docgenCollectionName =
    options.docgenCollectionName || "STORYBOOK_REACT_CLASSES";
  if (typeof options.setDisplayName !== "boolean") {
    options.setDisplayName = true;
  }

  // Convert the loader's flat options into the expected structure for
  // react-docgen-typescript.
  // See: node_modules/react-docgen-typescript/lib/parser.d.ts
  const parserOptions: ParserOptions = {
    propFilter:
      options.skipPropsWithName || options.skipPropsWithoutDoc
        ? {
            skipPropsWithName: options.skipPropsWithName || undefined,
            skipPropsWithoutDoc: options.skipPropsWithoutDoc || undefined,
          }
        : options.propFilter,
  };

  // Configure parser using settings provided to loader.
  // See: node_modules/react-docgen-typescript/lib/parser.d.ts
  let parser: FileParser = withDefaultConfig(parserOptions);

  let compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    esModuleInterop: true, // 可调用的CommonJS模块必须被做为默认导入，在已有的“老式”模块模式之间保证最佳的互通性
    allowSyntheticDefaultImports: true // 允许使用 ES2015 默认的 import 风格
  };
  let tsConfigFile: ts.ParsedCommandLine | null = null;

  if (options.tsconfigPath) {
    parser = withCustomConfig(options.tsconfigPath, parserOptions);

    tsConfigFile = getTSConfigFile(options.tsconfigPath!);
    compilerOptions = tsConfigFile.options;

    const filesToLoad = tsConfigFile.fileNames;
    loadFiles(filesToLoad);
  } else if (options.compilerOptions) {
    parser = withCompilerOptions(options.compilerOptions, parserOptions);
    compilerOptions = options.compilerOptions;
  }

  if (!tsConfigFile) {
    const basePath = path.dirname(context.context);
    tsConfigFile = getDefaultTSConfigFile(basePath);

    const filesToLoad = tsConfigFile.fileNames;
    loadFiles(filesToLoad);
  }

  const componentDocs = parser.parseWithProgramProvider(
    context.resourcePath,
    () => {
      if (languageService) {
        return languageService.getProgram()!;
      }

      const servicesHost = createServiceHost(compilerOptions, files);

      languageService = ts.createLanguageService(
        servicesHost,
        ts.createDocumentRegistry()
      );

      return languageService!.getProgram()!;
    },
  );

  // Return amended source code if there is docgen information available.
  if (componentDocs.length) {
    return {
      // filename: context.resourcePath,
      // source,
      componentDocs,
      // docgenCollectionName: options.docgenCollectionName,
      // setDisplayName: options.setDisplayName,
    };
  }

  // Return null if no docgen information was available.
  return {};
}

function getTSConfigFile(tsconfigPath: string): ts.ParsedCommandLine {
  const basePath = path.dirname(tsconfigPath);
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  return ts.parseJsonConfigFileContent(
    configFile!.config,
    ts.sys,
    basePath,
    {},
    tsconfigPath,
  );
}

function getDefaultTSConfigFile(basePath: string): ts.ParsedCommandLine {
  return ts.parseJsonConfigFileContent({}, ts.sys, basePath, {});
}

function loadFiles(filesToLoad: string[]): void {
  let normalizedFilePath: string;
  filesToLoad.forEach(filePath => {
    normalizedFilePath = path.normalize(filePath);
    files.set(normalizedFilePath, {
      text: fs.readFileSync(normalizedFilePath, "utf-8"),
      version: 0,
    });
  });
}

function createServiceHost(
  compilerOptions: ts.CompilerOptions,
  files: Map<string, TSFile>,
): ts.LanguageServiceHost {
  return {
    getScriptFileNames: () => {
      return [...files.keys()];
    },
    getScriptVersion: fileName => {
      const file = files.get(fileName);
      return (file && file.version.toString()) || "";
    },
    getScriptSnapshot: fileName => {
      if (!fs.existsSync(fileName)) {
        return undefined;
      }

      let file = files.get(fileName);

      if (file === undefined) {
        const text = fs.readFileSync(fileName).toString();

        file = { version: 0, text };
        files.set(fileName, file);
      }

      return ts.ScriptSnapshot.fromString(file!.text!);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };
}
