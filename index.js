const express = require("express");
const fetch = require("node-fetch");

const winston = require("winston");
const PORT = process.env.PORT || 3000;
const path = require("path");

const expressMinifyHTML = require("express-minify-html");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const minify = require("./middleware/minify");

const utils = require("./utils");

const helmet = require("helmet");
const bodyParser = require("body-parser");
const limit = require("express-limit").limit;

let meta = {
  links: require("./meta/links.json"),
  projects: require("./meta/projects.json"),
  analytics: require("./meta/analytics.json"),
  isProduction: process.env["NODE_ENV"] == "production",
  meta: require("./meta/meta.json"),
  blogs: [],
};

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "user-service" },
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, `logs/error.log`),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(__dirname, `logs/combined.log`),
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

const blogApi = require("./routes/blog");

let app = express();

// Security & Improvment Middleware

app.use(
  expressMinifyHTML({
    override: true,
    exception_url: false,
    htmlMinifier: {
      removeComments: true,
      collapseWhitespace: true,
      collapseBooleanAttributes: true,
      removeAttributeQuotes: true,
      removeEmptyAttributes: true,
      minifyJS: true,
    },
  })
);

app.use(compression());

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use("/static", express.static("static"));
app.use(express.static("static"));

// Parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser(process.env.COOKIE_SECRET));

app.use((req, res, next) => {
  var ip = req.signedCookies[`_IP_ADDRESS`];

  if (ip) {
    if (ip.split(".").length < 1) {
      res.clearCookie(`_IP_ADDRESS`);

      res.status(500).send(`Internal server error. Please reload the page.`);
      return;
    }

    utils.addLog(`${req.method} ${req.path}`, ip, req.headers["user-agent"]);

    ip = `${ip.split(".")[0]}.**.**.**`;
  }

  // logging
  logger.log(
    `info`,
    `${req.method} ${req.path} (${req.headers["user-agent"]}) ${
      ip || "UNKNOWN IP"
    }`
  );

  next();
});

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Routes

app.use("/blog", blogApi);

app.get("/", async (req, res) => {
  // copy json
  var metaForPage = JSON.parse(JSON.stringify(meta));

  metaForPage["meta"] = meta["meta"][req.path];

  if (
    meta["isProduction"] == true &&
    req.cookies["disable_analytics"] == undefined
  ) {
    metaForPage["renderAnalytics"] = true;
  } else {
    metaForPage["renderAnalytics"] = false;
  }

  if (req.header("dnt") == 1) {
    metaForPage["renderAnalytics"] = false;
  }

  try {
    var showHiddenBlogs = false;

    if (req.signedCookies["sid"]) {
      showHiddenBlogs = true;
    }

    var websiteBlogs = null;

    if (showHiddenBlogs == false) {
      websiteBlogs = await blogApi.fetchBlogs({
        hidden: false,
      });
    } else {
      websiteBlogs = await blogApi.fetchBlogs();
    }

    metaForPage["blogs"] = websiteBlogs;
  } catch (err) {
    logger.log(`error`, `Could not fetch blogs: `, err);

    metaForPage["blogs"] = [];
  }

  if (meta.isProduction == true) {
    metaForPage["cache"] = true;
  }

  res.render(`home`, metaForPage);
});

app.get("/arc-sw.js", async (req, res) => {
  var r = await fetch(`https://arc.io/arc-sw.js`);

  r = await r.text();

  res.set(`content-type`, `application/javascript`);
  res.end(r);
});

app.get("/analytics", (req, res) => {
  res.redirect(`https://ackee-production-yukv.up.railway.app/`);
});

app.get("/scripts/science.js", async (req, res) => {
  try {
    var fetchRes = await fetch(
      `https://${meta.analytics.AckeeHost}/tracker.js`
    );

    var text = await fetchRes.text();

    res.set(`content-type`, `text/javascript`);
    res.end(text);
  } catch (err) {
    logger.log(`error`, `Failed to load analytics ${err}`);

    res.end(`alert('failed to load analytics');`);
  }
});

app.post("/e", (req, res) => {
  if (!req.body["e_address"]) {
    return res.status(400).end(``);
  }

  var ip = req.body["e_address"].split(".")[0];

  res.cookie(`_IP_ADDRESS`, req.body["e_address"], {
    signed: true,
  });

  utils.addLog(
    `${req.method} ${req.path}`,
    req.body["e_address"],
    req.headers["user-agent"]
  );

  console.log(`GOT IP ${ip}.**.**.**`);
  res.end();
});

app.get("/logs", async (req, res) => {
  if (!req.signedCookies["sid"]) {
    return res.redirect("/blog/login");
  }

  var logs = await utils.getLogs();

  logs.reverse();
  res.render(`logs`, {
    meta: {
      ShouldShowOnSearchEngine: false,
    },
    logs,
  });
});

app.get("*", (req, res) => {
  res.status(404).render(`404`, {
    meta: {
      Name: "404 Not Found",
      Description: "The page you were looking for was not found!",
    },
  });
});

app.listen(PORT, () => {
  logger.log(
    `info`,
    `Starting app as (${process.env.NODE_ENV}) ${new Date().toString()}`
  );
});
