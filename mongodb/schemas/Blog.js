const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema({
  // id of the blog

  id: Number,

  // title of the blog
  title: String,

  // text of the blog

  data: String,

  // html of the blog

  html_content: String,

  // url slug

  slug: String,

  // quick teaser of the blog (auto generated)

  teaser: String,

  // the date it was created
  date: { type: Date, default: Date.now },

  // how many users have read the blog
  viewCount: Number,

  // whether it is hidden and should be shown to the public
  hidden: Boolean,

  // whether or not it should be public

  public: Boolean,

  // when it was published
  publishedAt: String,
});

blogSchema.methods.publish = function () {
  this.publishedAt = new Date().toString();
  this.hidden = false;
};

module.exports = mongoose.model("Blog", blogSchema);
