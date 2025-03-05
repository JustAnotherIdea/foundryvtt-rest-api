import * as fsPromises from "fs/promises";
import copy from "rollup-plugin-copy";
import scss from "rollup-plugin-scss";
import { defineConfig, Plugin } from "vite";
import * as path from "path";
import * as os from "os";
import { id as moduleId } from "./src/module.json"; // Add this import at the top

const moduleVersion = process.env.MODULE_VERSION;
const githubProject = process.env.GH_PROJECT;
const githubTag = process.env.GH_TAG;

console.log("VSCODE_INJECTION", process.env.VSCODE_INJECTION);

const foundryVttDataPath = path.join(
  os.homedir(),
  "AppData",
  "Local",
  "FoundryVTT",
  "Data",
  "modules"
);

export default defineConfig({
  build: {
    sourcemap: true,
    outDir: "dist", // Add this line to output to dist directory
    rollupOptions: {
      input: "src/ts/module.ts",
      output: {
        dir: process.env.CI ? "dist/scripts" : path.join(foundryVttDataPath, moduleId, "scripts"),
        entryFileNames: "module.js",
        format: "es",
      },
    },
  },
  plugins: [
    updateModuleManifestPlugin(),
    scss({
      output: function(styles) {
        // Write to FoundryVTT path for development
        if (!process.env.CI) {
          fsPromises.writeFile(path.join(foundryVttDataPath, moduleId, "style.css"), styles);
        }
        // Always write to dist for CI
        fsPromises.mkdir("dist", { recursive: true })
          .then(() => fsPromises.writeFile("dist/styles/style.css", styles));
      },
      sourceMap: true,
      watch: ["src/styles/*.scss"],
    }),
    copy({
      targets: [
        // Development targets
        ...(!process.env.CI ? [
          { src: "src/languages", dest: path.join(foundryVttDataPath, moduleId) },
          { src: "src/templates", dest: path.join(foundryVttDataPath, moduleId) }
        ] : []), 
        // CI/Production targets
        { src: "src/languages", dest: "dist" },
        { src: "src/templates", dest: "dist" }
      ],
      hook: "writeBundle",
    }),
  ],
});

function updateModuleManifestPlugin(): Plugin {
  return {
    name: "update-module-manifest",
    async writeBundle(): Promise<void> {
      // Create directory in FoundryVTT modules path (for development)
      if (!process.env.CI) {
        await fsPromises.mkdir(path.join(foundryVttDataPath, moduleId), { recursive: true });
      }

      // Always create dist directory (for CI/production)
      await fsPromises.mkdir("dist", { recursive: true });

      const packageContents = JSON.parse(
        await fsPromises.readFile("./package.json", "utf-8")
      ) as Record<string, unknown>;
      const version = moduleVersion || (packageContents.version as string);
      const manifestContents: string = await fsPromises.readFile(
        "src/module.json",
        "utf-8"
      );
      const manifestJson = JSON.parse(manifestContents) as Record<
        string,
        unknown
      >;
      manifestJson["version"] = version;
      if (githubProject) {
        const baseUrl = `https://github.com/${githubProject}/releases`;
        manifestJson["manifest"] = `${baseUrl}/latest/download/module.json`;
        if (githubTag) {
          manifestJson[
            "download"
          ] = `${baseUrl}/download/${githubTag}/module.zip`;
        }
      }

      // Write updated manifest to FoundryVTT modules path (for development)
      if (!process.env.CI) {
        await fsPromises.writeFile(
          path.join(foundryVttDataPath, moduleId, "module.json"),
          JSON.stringify(manifestJson, null, 4)
        );
      }

      // Always write updated manifest to dist directory (for CI/production)
      await fsPromises.writeFile(
        "dist/module.json",
        JSON.stringify(manifestJson, null, 4)
      );
    },
  };
}
