import { assertProductionConfiguration } from "./production-config";

const configured = {
  IDBRF_RUNTIME_STAGE: "production",
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://service:test-fixture@database.example.org/riacho?sslmode=require",
  PRODUCTION_DATABASE_HOST: "database.example.org",
  PRODUCTION_DATABASE_NAME: "riacho",
  CORS_ORIGIN: "https://igreja.example.org",
  JWT_SECRET: "test-fixture-production-session-secret-with-more-than-32-characters",
  PRIVATE_BLOB_READ_WRITE_TOKEN: "test-private-token",
  BLOB_READ_WRITE_TOKEN: "test-public-token",
};

describe("configuração do ambiente real", () => {
  it("aceita o destino e os serviços explicitamente separados", () => {
    expect(() => assertProductionConfiguration(configured)).not.toThrow();
  });

  it.each([
    { DATABASE_URL: "postgresql://service:test-fixture@database.example.org/riacho_hml?sslmode=require" },
    { PRODUCTION_DATABASE_HOST: "other.example.org" },
    { DATABASE_URL: "postgresql://service:test-fixture@database.example.org/riacho" },
    { CORS_ORIGIN: "*" },
    { CORS_ORIGIN: "http://igreja.example.org" },
    { PRIVATE_BLOB_READ_WRITE_TOKEN: "test-public-token" },
    { HML_DEMO_PASSWORD_HASH: "synthetic-fixture" },
  ])("bloqueia configuração incompatível %#", overrides => {
    expect(() => assertProductionConfiguration({ ...configured, ...overrides })).toThrow();
  });
});
