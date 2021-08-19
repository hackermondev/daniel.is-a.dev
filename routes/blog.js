const express = require("express");
const mongo = require("../mongodb/mongo.js");

const router = express.Router();
const ms = require("ms");

const urlSlug = require("url-slug");
const showdown = require("showdown");

const JSTeaser = require("teaser");
const analytics = require("../meta/analytics.json");

const { SitemapStream, streamToPromise } = require("sitemap");
const { createGzip } = require("zlib");
const { Readable } = require("stream");

router.fetchBlogs = async function (query = {}) {
  if (mongo.db.readyState != 1) {
    return [];
  }

  var blogs = await mongo.Blog.find(query).exec();

  return blogs;
};

router.get("/sitemap.xml", async (req, res) => {
  if (mongo.db.readyState != 1) {
    return res.status(500).end(`No connection to mongodb database.`);
  }

  // xml
  res.header("Content-Type", "application/xml");

  // send in gzip
  res.header("Content-Encoding", "gzip");

  try {
    const smStream = new SitemapStream({
      hostname: `https://${req.headers["host"]}/`,
    });

    const pipeline = smStream.pipe(createGzip());

    var blogs = await router.fetchBlogs({
      public: true,
      hidden: false,
    });

    await Promise.all(
      blogs.map((blog) => {
        smStream.write({
          url: `/blog/${blog.slug}`,
          changefreq: "daily",
          priority: 0.7,
        });
      })
    );

    // make sure to attach a write stream such as streamToPromise before ending

    smStream.end();
    // stream write the response

    pipeline.pipe(res).on("error", (e) => {
      throw e;
    });
  } catch (e) {
    console.error(e);

    res.status(500).end();
  }
});

router.post("/preview", (req, res) => {
  // preview blog markdown

  var data = {
    title: req.body["blog_title"] || "Unknown",
    text_content: req.body["blog_data"] || "??? No content found",
    slug: null,
    teaser: "",
    viewCount: 69,

    public: false,
    hidden: true,
    publishedAt: new Date().toString(),
    createdAt: `0 minutes ago`,

    html_content: "",
  };

  data.slug = `${urlSlug(data.title)}-1`;

  var converter = new showdown.Converter();

  data["html_content"] = converter.makeHtml(data["text_content"]);

  res.render(`blogs/view.ejs`, {
    blog: data,
    previousLink: `/blog/new?title=${encodeURIComponent(
      data.title
    )}&data=${encodeURIComponent(data.text_content)}`,
    renderAnalytics: false,
    isPreviewMode: true,
    meta: {
      'Page': '',
      'ShouldShowOnSearchEngine': false
    },
  });
});

router.post("/submit", async (req, res) => {
  // submit blog & create post

  var oldBlogs = await router.fetchBlogs();

  var data = {
    id: oldBlogs.length + 1,
    title: req.body["blog_title"] || "Unknown",
    data: req.body["blog_data"] || "??? No content found",
    slug: null,
    teaser: "",
    viewCount: 0,

    public:
      req.body["blog_privacy"] == "public" ||
      req.body["blog_privacy"] == "unlisted",
    hidden:
      req.body["blog_privacy"] == "unlisted" ||
      req.body["blog_privacy"] == "private",

    publishedAt: new Date().toString(),
    createdAt: `0 minutes ago`,

    html_content: "",
  };

  // slug
  data.slug = `${urlSlug(data.title)}-${data.id}`;

  // markdown
  var converter = new showdown.Converter();

  data["html_content"] = converter.makeHtml(data["data"]);

  // teaser
  var jsteaser = new JSTeaser({
    title: data.title,
    text: data.data,
  });

  data.teaser = jsteaser.summarize()[0];

  // save to monogodb

  var isNewBlog = req.body["old_blog_id"] == "new";
  var blog = new mongo.Blog(data);

  if (isNewBlog == true) {
    await blog.save();
  } else {
    // dont reset view counter or id

    data.id = data.id -= 1;
    data.slug = `${urlSlug(data.title)}-${data.id}`;

    delete data["viewCount"];

    await mongo.Blog.findOneAndUpdate(
      {
        id: req.body["old_blog_id"],
      },
      data
    );
  }

  // res.render(`blogs/view.ejs`, { blog: data, previousLink: `/blog/new?title=${encodeURIComponent(data.title)}&data=${encodeURIComponent(data.text_content)}`, renderAnalytics: false, isPreviewMode: true })

  res.redirect(`/blog/${data.slug}`);
});

router.get("/new", (req, res) => {
  if (!req.signedCookies["sid"]) {
    return res.redirect("/blog/login");
  }

  if (mongo.db.readyState != 1) {
    return res.status(500).json({
      error: `No connection to mongodb database.`,
    });
  }

  var data = {
    title: req.query["title"] || "",
    markdown: req.query["data"] || "###Placeholder\nYour content goes here",
    old_blog_id: "new",
  };

  res.render(`blogs/new`, {
    renderAnalytics: false,
    data,
    isEditing: false,
    meta: {
      'ShouldShowOnSearchEngine': false,
      'Page': ''
    },
  });
});

// router.post('/login', (req, res) => {
//   var info = {
//     username: req.body['blog_username'],
//     password: req.body['blog_username']
//   }

//   if (info.username != 'hackermondev' && info.password != process.env.BLOG_PASSWORD) {
//     return res.render('blogs/login', {
//       renderAnalytics: false,
//       message: `Invalid username or password.`
//     })
//   }

//   res.cookie(`sid`, JSON.stringify({
//     _: new Date().getTime(),
//     userAgent: req.headers['user-agent']
//   }), { signed: true })

//   res.redirect('/blog/new')
// })

router.get("/login", (req, res) => {
  if (req.signedCookies["sid"]) {
    return res.redirect("/blog/new");
  }

  var auth = req.headers["authorization"];

  if (auth) {
    auth = auth.split(" ")[1];

    var authData = Buffer.from(auth, "base64").toString("ascii").split(":");

    if (
      authData[0] == "hackermondev" &&
      authData[1] == process.env.BLOG_PASSWORD
    ) {
      res.cookie(
        `sid`,
        JSON.stringify({
          _: new Date().getTime(),
          userAgent: req.headers["user-agent"],
        }),
        { signed: true }
      );

      return res.redirect("/blog/new");
    }
  }

  res.set(`WWW-Authenticate`, `Basic realm="Auth is required"`);

  res.status(401);
  res.send(`Authorization is required.`);
  // res.render(`blogs/login`, {
  //   renderAnalytics: false,
  //   message: ''
  // })
});

router.get("/edit/:slug", async (req, res) => {
  // edit blogs

  if (mongo.db.readyState != 1) {
    return res.status(500).json({
      error: `It's me, not you! The blog database hasn't fully loaded yet.`,
    });
  }

  if (!req.signedCookies["sid"]) {
    return res.redirect("/blog/login");
  }

  var blogSlug = req.params.slug.split("-");
  var blogID = blogSlug[blogSlug.length - 1];

  // console.log(blogID)
  var blogItems = await mongo.Blog.find({
    id: blogID,
  });

  if (blogItems.length == 0) {
    return res.status(404).render("404");
  }

  var blog = blogItems[0];

  var data = {
    title: blog.title,
    markdown: blog.data,
    old_blog_id: blog.id,
  };

  res.render(`blogs/new`, {
    renderAnalytics: false,
    data,
    isEditing: true,
    meta: {
      'ShouldShowOnSearchEngine': false,
      'Page': ''
    },
  });
});

router.get("/delete/:slug", async (req, res) => {
  // delete blogs

  if (mongo.db.readyState != 1) {
    return res.status(500).json({
      error: `It's me, not you! The blog database hasn't fully loaded yet.`,
    });
  }

  if (!req.signedCookies["sid"]) {
    return res.redirect("/blog/login");
  }

  var blogSlug = req.params.slug.split("-");
  var blogID = blogSlug[blogSlug.length - 1];

  // console.log(blogID)
  var blogItems = await mongo.Blog.find({
    id: blogID,
  });

  if (blogItems.length == 0) {
    return res.status(404).render("404");
  }

  var blog = blogItems[0];

  var data = {
    title: blog.title,
    markdown: blog.data,
    old_blog_id: blog.id,
  };

  await mongo.Blog.deleteOne({
    id: blog.id,
  });

  res.redirect("/blog/new");
});

router.get("/:slug", async (req, res) => {
  // blogs
  if (mongo.db.readyState != 1) {
    return res.status(500).json({
      error: `It's me, not you! The blog database hasn't fully loaded yet.`,
    });
  }

  var blogSlug = req.params.slug.split("-");
  var blogID = blogSlug[blogSlug.length - 1];

  // console.log(blogID)

  if (!blogID) {
    return res.status(404).render("404");
  }

  var blogItems = await mongo.Blog.find({
    id: blogID,
  });

  if (blogItems.length == 0) {
    return res.status(404).render("404");
  }

  var blog = blogItems[0];
  var isHackermon = false;

  if (req.signedCookies["sid"]) {
    isHackermon = true;
  }

  if (!blog.public && !isHackermon) {
    return res.status(403).end(`You don't have access to this blog.`);
  }

  var timeAgo = new Date().getTime() - new Date(blog.publishedAt).getTime();

  blog.createdAt = `${ms(timeAgo, { long: true })} ago`;

  var shouldShowAnalytics = true;

  if (req.header("dnt") == 1 || process.env["NODE_ENV"] != "production") {
    shouldShowAnalytics = false;
  }

  res.render(`blogs/view.ejs`, {
    blog,
    previousLink: `/`,
    renderAnalytics: shouldShowAnalytics,
    isPreviewMode: false,
    analytics,
    meta: {
      'Name': blog.title,
      'Description': blog.teaser,
      'ShouldShowOnSearchEngine': true,
      "Page": `/blog/${blog.slug}`
    },
  });
});

router.get(`/:slug/increase_counter`, async (req, res) => {
  // blogs
  if (mongo.db.readyState != 1) {
    return res.status(500).json({
      error: `It's me, not you! The blog database hasn't fully loaded yet.`,
    });
  }

  var blogSlug = req.params.slug.split("-");
  var blogID = blogSlug[blogSlug.length - 1];

  // console.log(blogID)

  if (!blogID) {
    return res.status(404).render("404");
  }

  var blogItems = await mongo.Blog.find({
    id: blogID,
  });

  if (blogItems.length == 0) {
    return res.status(404).render("404");
  }

  var blog = blogItems[0];
  var isHackermon = false;

  if (req.signedCookies["sid"]) {
    isHackermon = true;
  }

  if (!blog.public && !isHackermon) {
    return res.status(403).end(`You don't have access to this blog.`);
  }

  // increase number on counter

  await mongo.Blog.findOneAndUpdate(
    {
      slug: req.params.slug,
    },
    {
      viewCount: (blog.viewCount += 1),
    }
  );

  res.status(200).end(`OK!`);
});

module.exports = router;
