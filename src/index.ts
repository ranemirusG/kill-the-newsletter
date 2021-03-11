#!/usr/bin/env node

import path from "path";
import express from "express";
import { SMTPServer } from "smtp-server";
import mailparser from "mailparser";
import escapeStringRegexp from "escape-string-regexp";
import fs from "fs-extra";
import cryptoRandomString from "crypto-random-string";
import { html, HTML } from "@leafac/html";
import { css, process as processCSS } from "@leafac/css";
import { sql, Database } from "@leafac/sqlite";
import databaseMigrate from "@leafac/sqlite-migration";

const VERSION = require("../package.json").version;

export default function killTheNewsletter(
  rootDirectory: string
): { webApplication: express.Express; emailApplication: SMTPServer } {
  const webApplication = express();

  webApplication.set("url", "http://localhost:4000");
  webApplication.set("email port", 2525);
  webApplication.set("email host", "localhost");
  webApplication.set("administrator", "mailto:kill-the-newsletter@leafac.com");

  fs.ensureDirSync(rootDirectory);
  const database = new Database(
    path.join(rootDirectory, "kill-the-newsletter.db")
  );
  databaseMigrate(database, [
    sql`
      CREATE TABLE "feeds" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "reference" TEXT NOT NULL UNIQUE,
        "title" TEXT NOT NULL
      );

      CREATE TABLE "entries" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "reference" TEXT NOT NULL UNIQUE,
        "feed" INTEGER NOT NULL REFERENCES "feeds",
        "title" TEXT NOT NULL,
        "author" TEXT NOT NULL,
        "content" TEXT NOT NULL
      );
    `,
  ]);

  webApplication.use(express.static(path.join(__dirname, "../public")));
  webApplication.use(express.urlencoded({ extended: true }));

  const logo = fs.readFileSync(path.join(__dirname, "../public/logo.svg"));

  function layout(body: HTML): HTML {
    return processCSS(html`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <meta name="generator" content="Kill the Newsletter!/${VERSION}" />
          <meta
            name="description"
            content="Convert email newsletters into Atom feeds."
          />
          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="${webApplication.get("url")}/favicon-32x32.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="${webApplication.get("url")}/favicon-16x16.png"
          />
          <link
            rel="icon"
            type="image/x-icon"
            href="${webApplication.get("url")}/favicon.ico"
          />
          <title>Kill the Newsletter!</title>
        </head>
        <body
          style="${css`
            @at-root {
              body {
                font-size: 14px;
                font-family: --apple-system, BlinkMacSystemFont, "Segoe UI",
                  Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans",
                  "Helvetica Neue", sans-serif;
                line-height: 1.5;
                max-width: 400px;
                padding: 0 1em;
                margin: 1em auto;
                text-align: center;
              }

              code {
                font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo,
                  monospace;
              }

              a,
              button {
                color: inherit;
                text-decoration: none;
                transition: color 0.2s;

                &:hover {
                  color: #58a6ff;
                }
              }

              h1 {
                font-size: 1.5em;
              }

              footer {
                font-size: 0.857em;
              }

              input,
              button {
                font-family: --apple-system, BlinkMacSystemFont, "Segoe UI",
                  Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans",
                  "Helvetica Neue", sans-serif;
                font-size: 1em;
                line-height: 1.5;
                color: inherit;
                background-color: transparent;
                margin: 0;
                outline: none;
              }

              input {
                box-sizing: border-box;
                width: 100%;
                padding: 0.2em 1em;
                border: 1px solid darkgray;
                border-radius: 10px;
                box-shadow: inset 0px 1px #ffffff22, 0px 1px #00000022;
                -webkit-appearance: none;
                transition: border-color 0.2s;

                &:focus {
                  border-color: #58a6ff;
                }
              }

              button {
                font-weight: bold;
                padding: 0;
                border: none;
                cursor: pointer;
              }

              @media (prefers-color-scheme: light) {
                body {
                  color: #000000d4;
                }
              }

              @media (prefers-color-scheme: dark) {
                body {
                  color: #ffffffd4;
                  background-color: #1e1e1e;
                }
              }
            }
          `}"
        >
          <header>
            <h1>
              <a href="${webApplication.get("url")}/">Kill the Newsletter!</a>
            </h1>
            <p>Convert email newsletters into Atom feeds</p>
            <p
              style="${css`
                @media (prefers-color-scheme: dark) {
                  path {
                    fill: #ffffffd4;
                  }
                }
              `}"
            >
              $${logo}
            </p>
          </header>
          <main>$${body}</main>
          <footer>
            <p>
              By <a href="https://leafac.com">Leandro Facchinetti</a> ·
              <a href="https://github.com/leafac/kill-the-newsletter.com"
                >Source</a
              >
              ·
              <a href="${webApplication.get("administrator")}"
                >Report an Issue</a
              >
            </p>
          </footer>
        </body>
      </html>
    `);
  }

  webApplication.get<{}, HTML, {}, {}, {}>("/", (req, res) => {
    res.send(
      layout(html`
        <form method="post" action="${webApplication.get("url")}/">
          <p>
            <input
              type="text"
              name="name"
              placeholder="Newsletter name…"
              maxlength="500"
              required
              autocomplete="off"
              autofocus
            />
          </p>
          <p><button>Create inbox</button></p>
        </form>
      `)
    );
  });

  webApplication.post<{}, HTML, { name?: string }, {}, {}>("/", (req, res) => {
    if (
      req.body.name === undefined ||
      req.body.name.trim() === "" ||
      req.body.name.length > 500
    )
      return res.status(400).send(
        layout(
          html`<p>
            Error: Missing newsletter name.
            <a href="${webApplication.get("url")}/"
              ><strong>Try again</strong></a
            >.
          </p>`
        )
      );

    const reference = newReference();

    const created = html`
      <p>
        Sign up for the newsletter with<br />
        <code class="copyable"
          >${reference}@${webApplication.get("email host")}</code
        >
      </p>
      <p>
        Subscribe to the Atom feed at<br />
        <code class="copyable"
          >${webApplication.get("url")}/feeds/${reference}.xml</code
        >
      </p>
      <p>
        <strong>Don’t share these addresses.</strong><br />
        They contain an identifier that other people could use to send you spam
        and to control your newsletter subscriptions.
      </p>
      <p>Enjoy your readings!</p>
      <p>
        <a href="${webApplication.get("url")}/"
          ><strong>Create Another Inbox</strong></a
        >
      </p>
    `;

    const feedId = database.run(
      sql`INSERT INTO "feeds" ("reference", "title") VALUES (${reference}, ${req.body.name})`
    ).lastInsertRowid;
    database.run(
      sql`
        INSERT INTO "entries" ("reference", "feed", "title", "author", "content")
        VALUES (${newReference()}, ${feedId}, ${`“${req.body.name}” inbox created`}, ${"Kill the Newsletter!"}, ${created})
      `
    );

    res.send(
      layout(html`
        <p>
          <strong>“${req.body.name}” inbox created</strong>
          $${created}
        </p>
      `)
    );
  });

  const emailApplication = new SMTPServer();

  function newReference(): string {
    return cryptoRandomString({
      length: 16,
      characters: "abcdefghijklmnopqrstuvwxyz0123456789",
    });
  }

  return { webApplication, emailApplication };
}

if (require.main === module) {
  console.log(`Kill the Newsletter!/${VERSION}`);
  const configurationFile = path.resolve(
    process.argv[2] ?? path.join(process.cwd(), "configuration.js")
  );
  require(configurationFile)(require);
  console.log(`Configuration file loaded from ‘${configurationFile}’.`);
}

/*
export const webServer = express()
  .use(["/feeds", "/alternate"], (req, res, next) => {
    res.header("X-Robots-Tag", "noindex");
    next();
  })
  .get(
    alternatePath(":feedIdentifier", ":entryIdentifier"),
    async (req, res, next) => {
      try {
        const { feedIdentifier, entryIdentifier } = req.params;
        const path = feedFilePath(feedIdentifier);
        let text;
        try {
          text = await fs.readFile(path, "utf8");
        } catch {
          return res.sendStatus(404);
        }
        const feed = new JSDOM(text, { contentType: "text/xml" });
        const document = feed.window.document;
        const link = document.querySelector(
          `link[href="${alternateURL(feedIdentifier, entryIdentifier)}"]`
        );
        if (link === null) return res.sendStatus(404);
        res.send(
          entities.decodeXML(
            link.parentElement!.querySelector("content")!.textContent!
          )
        );
      } catch (error) {
        console.error(error);
        next(error);
      }
    }
  )

export const emailServer = new SMTPServer({
  disabledCommands: ["AUTH", "STARTTLS"],
  async onData(stream, session, callback) {
    try {
      const email = await mailparser.simpleParser(stream);
      const content =
        typeof email.html === "string" ? email.html : email.textAsHtml ?? "";
      for (const address of new Set(
        session.envelope.rcptTo.map(({ address }) => address)
      )) {
        const match = address.match(
          new RegExp(
            `^(?<identifier>\\w+)@${escapeStringRegexp(EMAIL_DOMAIN)}$`
          )
        );
        if (match?.groups === undefined) continue;
        const identifier = match.groups.identifier.toLowerCase();
        const path = feedFilePath(identifier);
        let text;
        try {
          text = await fs.readFile(path, "utf8");
        } catch {
          continue;
        }
        const feed = new JSDOM(text, { contentType: "text/xml" });
        const document = feed.window.document;
        const updated = document.querySelector("feed > updated");
        if (updated === null) {
          console.error(`Field ‘updated’ not found: ‘${path}’`);
          continue;
        }
        updated.textContent = now();
        const renderedEntry = entry(
          identifier,
          createIdentifier(),
          X(email.subject ?? ""),
          X(email.from?.text ?? ""),
          X(content)
        );
        const firstEntry = document.querySelector("feed > entry:first-of-type");
        if (firstEntry === null)
          document
            .querySelector("feed")!
            .insertAdjacentHTML("beforeend", renderedEntry);
        else firstEntry.insertAdjacentHTML("beforebegin", renderedEntry);
        while (feed.serialize().length > 500_000) {
          const lastEntry = document.querySelector("feed > entry:last-of-type");
          if (lastEntry === null) break;
          lastEntry.remove();
        }
        await writeFileAtomic(
          path,
          html`<?xml version="1.0" encoding="utf-8"?>${feed.serialize()}`.trim()
        );
      }
      callback();
    } catch (error) {
      console.error(
        `Failed to receive message: ‘${JSON.stringify(session, null, 2)}’`
      );
      console.error(error);
      stream.resume();
      callback(new Error("Failed to receive message. Please try again."));
    }
  },
}).listen(EMAIL_PORT);

function feed(identifier: string, name: string, initialEntry: string): string {
  return html`
    <?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <link
        rel="self"
        type="application/atom+xml"
        href="${feedURL(identifier)}"
      />
      <link rel="alternate" type="text/html" href="${webApplication.get("url")}" />
      <id>${urn(identifier)}</id>
      <title>${name}</title>
      <subtitle
        >Kill the Newsletter! Inbox: ${feedEmail(identifier)} →
        ${feedURL(identifier)}</subtitle
      >
      <updated>${now()}</updated>
      <author><name>Kill the Newsletter!</name></author>
      ${initialEntry}
    </feed>
  `.trim();
}

function entry(
  feedIdentifier: string,
  entryIdentifier: string,
  title: string,
  author: string,
  content: string
): string {
  return html`
    <entry>
      <id>${urn(entryIdentifier)}</id>
      <title>${title}</title>
      <author><name>${author}</name></author>
      <updated>${now()}</updated>
      <link
        rel="alternate"
        type="text/html"
        href="${alternateURL(feedIdentifier, entryIdentifier)}"
      />
      <content type="html">${content}</content>
    </entry>
  `.trim();
}

function alternatePath(
  feedIdentifier: string,
  entryIdentifier: string
): string {
  return `/alternate/${feedIdentifier}/${entryIdentifier}.html`;
}

function alternateURL(feedIdentifier: string, entryIdentifier: string): string {
  return `${webApplication.get("url")}${alternatePath(feedIdentifier, entryIdentifier)}`;
}

function urn(identifier: string): string {
  return `urn:kill-the-newsletter:${identifier}`;
}
*/