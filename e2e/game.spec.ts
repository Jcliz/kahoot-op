import { expect, test, type Browser, type Page } from "@playwright/test";

/** Espera a hidratação do React: clicar antes envia o formulário sem JavaScript. */
async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

const PHONE = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true };

async function createSession(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await context.newPage();
  await open(host, "/host");
  await host.getByLabel("Senha").fill("senha-e2e");
  await host.getByRole("button", { name: "Criar sessão" }).click();
  await expect(host).toHaveURL(/\/host\/[0-9a-f-]{36}$/);
  const sessionId = host.url().split("/").at(-1)!;
  const pin = await host.evaluate(
    async (id) => (await (await fetch(`/api/host/sessions/${id}`)).json()).pin as string,
    sessionId,
  );
  return { host, pin };
}

async function joinPhone(browser: Browser, pin: string, nickname: string): Promise<Page> {
  const context = await browser.newContext(PHONE);
  const phone = await context.newPage();
  await open(phone, `/?pin=${pin}`);
  await expect(phone.getByLabel("PIN do jogo")).toHaveValue(pin);
  await phone.getByLabel("Seu apelido").fill(nickname);
  await phone.getByRole("button", { name: "Entrar" }).click();
  await expect(phone.getByText("Você entrou")).toBeVisible();
  await expect(phone.getByText(nickname)).toBeVisible();
  return phone;
}

/** Durante a pergunta nada pode rolar no celular de 360 px. */
async function expectNoScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("telão e 3 celulares jogam 2 perguntas, com reconexão no meio", async ({ browser }) => {
  const { host, pin } = await createSession(browser);
  const ana = await joinPhone(browser, pin, "Ana");
  const bia = await joinPhone(browser, pin, "Bia");
  const caio = await joinPhone(browser, pin, "Caio");

  await expect(host.getByText("na sala")).toBeVisible();
  for (const name of ["Ana", "Bia", "Caio"]) await expect(host.getByText(name)).toBeVisible();

  // Pergunta 1 (correta: "Visitas técnicas aos clientes")
  await host.getByRole("button", { name: "Iniciar" }).click();
  await expect(host.getByText("Celular na mão, vai abrir em instantes")).toBeVisible();

  const correct = "Visitas técnicas aos clientes";
  for (const phone of [ana, bia, caio]) {
    await expect(phone.getByRole("button", { name: correct })).toBeVisible();
    await expectNoScroll(phone);
  }

  await ana.getByRole("button", { name: correct }).click();
  await expect(ana.getByText("Resposta enviada!")).toBeVisible();

  // Reconexão: Caio recarrega a aba no meio da pergunta e continua no jogo.
  await caio.reload();
  await expect(caio.getByRole("button", { name: correct })).toBeVisible();
  await caio.getByRole("button", { name: correct }).click();
  await expect(caio.getByText("Resposta enviada!")).toBeVisible();

  await expect(host.getByText(/2\s*de 3 responderam/)).toBeVisible();
  await bia.getByRole("button", { name: "Reuniões internas" }).click();

  // Todos responderam: fecha sozinho.
  await expect(host.getByText("Correta")).toBeVisible();
  await expect(ana.getByText("Acertou!")).toBeVisible();
  await expect(caio.getByText("Acertou!")).toBeVisible();
  await expect(bia.getByText("Errou!")).toBeVisible();

  await host.getByRole("button", { name: "Próximo" }).click();
  await expect(host.getByText("Top 5")).toBeVisible();
  await expect(ana.getByText("Você está em")).toBeVisible();

  // Pergunta 2: Caio não responde e o apresentador finaliza antes do tempo.
  await host.getByRole("button", { name: "Próxima pergunta" }).click();
  const q2 = "Entender o sistema pela visão do cliente";
  await expect(ana.getByRole("button", { name: q2 })).toBeVisible();
  await expectNoScroll(ana);
  await ana.getByRole("button", { name: q2 }).click();
  await bia.getByRole("button", { name: q2 }).click();
  await expect(host.getByText(/2\s*de 3 responderam/)).toBeVisible();
  await host.getByRole("button", { name: "Finalizar pergunta" }).click();

  await expect(caio.getByText("Tempo esgotado!")).toBeVisible();
  await expect(bia.getByText("Acertou!")).toBeVisible();
  await expect(caio.getByText("de 3")).toBeVisible();
});

test("participante removido volta para a entrada", async ({ browser }) => {
  const { host, pin } = await createSession(browser);
  const phone = await joinPhone(browser, pin, "Removível");

  await host.getByRole("button", { name: "Remover Removível" }).click();
  await expect(phone.getByText("Você saiu da sala")).toBeVisible();
  await phone.getByRole("link", { name: "Voltar para a entrada" }).click();
  await expect(phone.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("apelido repetido e PIN errado mostram a mensagem do design", async ({ browser }) => {
  const { pin } = await createSession(browser);
  await joinPhone(browser, pin, "Joãozinho");

  const context = await browser.newContext(PHONE);
  const phone = await context.newPage();
  await open(phone, `/?pin=${pin}`);
  await phone.getByLabel("Seu apelido").fill("JOAOZINHO");
  await phone.getByRole("button", { name: "Entrar" }).click();
  await expect(phone.getByText("Já tem alguém com esse apelido. Tente outro.")).toBeVisible();

  await phone.getByLabel("PIN do jogo").fill("999999");
  await phone.getByLabel("Seu apelido").fill("Outro");
  await phone.getByRole("button", { name: "Entrar" }).click();
  await expect(phone.getByText(/PIN não encontrado/)).toBeVisible();
});

test("entrada não puxa o jogo salvo sozinha; com o PIN dele, oferece voltar", async ({
  browser,
}) => {
  const { pin } = await createSession(browser);
  const phone = await joinPhone(browser, pin, "Retorno");

  // Abrir a entrada de novo mostra o formulário vazio, sem redirecionar.
  await open(phone, "/");
  await expect(phone.getByLabel("PIN do jogo")).toHaveValue("");
  await expect(phone.getByRole("button", { name: "Voltar ao jogo" })).toHaveCount(0);

  // Com o PIN daquele jogo, ainda ativo, oferece voltar com o mesmo apelido.
  await phone.getByLabel("PIN do jogo").fill(pin);
  await expect(phone.getByText("Você já está nesse jogo como")).toBeVisible();
  await phone.getByRole("button", { name: "Voltar ao jogo" }).click();
  await expect(phone.getByText("Você entrou")).toBeVisible();
  await expect(phone.getByText("Retorno")).toBeVisible();
});
