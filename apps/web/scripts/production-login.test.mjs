import assert from "node:assert/strict";
import test from "node:test";
import { hasEnabledLoginForm } from "./production-login.mjs";

const fields = '<input type="email"><input type="password">';

test("o formulário de acesso tem campos e botão de envio ativo", () => {
  assert.equal(hasEnabledLoginForm(`<form>${fields}<button type="submit">Entrar</button></form>`), true);
});

test("outros botões não mascaram o formulário de acesso desabilitado", () => {
  for (const disabled of ["disabled", 'disabled=""', 'aria-disabled="true"']) {
    const login = `<form>${fields}<button ${disabled} type="submit">Entrar</button></form>`;
    assert.equal(hasEnabledLoginForm(login + '<form><button type="submit">Buscar</button></form>'), false);
  }
  assert.equal(hasEnabledLoginForm(fields + '<button type="submit">Entrar</button>'), false);
});
