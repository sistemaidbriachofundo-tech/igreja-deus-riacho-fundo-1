/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  transformIgnorePatterns: ["/node_modules/", "/packages/shared/dist/"],
  collectCoverageFrom: [
    "**/*.(t|j)s",
    "!**/*.module.ts",
    "!**/main.ts",
    "!**/*.dto.ts",
  ],
  coverageDirectory: "../coverage",
  // Paths relative to repo root so Sonar maps SF:apps/api/src/...
  coverageReporters: ["text-summary", ["lcov", { projectRoot: "../.." }]],
  testEnvironment: "node",
  moduleNameMapper: {
    "^@idbrf/shared$": "<rootDir>/../../../packages/shared/src/index.ts",
    "^@idbrf/db$": "<rootDir>/../../../packages/db/src/index.ts",
  },
};
