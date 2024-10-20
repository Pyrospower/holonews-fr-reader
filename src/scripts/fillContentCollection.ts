import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false });

const page = await browser.newPage();
await page.goto(
  "https://www.reddit.com/r/HoloNews/new/?f=flair_name%3A%22FR+Issue%22&feedViewType=compactView",
);
await page.waitForTimeout(5000);

const rejectCookiesButton = page.locator(
  "shreddit-interactable-element#reject-nonessential-cookies-button",
);
if (await rejectCookiesButton.isVisible()) {
  await rejectCookiesButton.click();
}

await page.waitForTimeout(1500);

const translationMenu = page.locator("#translation-desktop-menu");
await translationMenu.click();
const translationButton = page.locator("#hui-translation-switch");
if (await translationButton.isVisible()) await translationButton.click();

await page.waitForTimeout(2000);

// Scroll to the bottom of the page
let isAtBottom = false;
while (!isAtBottom) {
  await page.locator("shreddit-feed-page-loading").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);

  // As long as <shreddit-loading> is there, we scroll down and wait for 2s
  const shredditLoading = page.locator("shreddit-loading");

  const isLoading = await shredditLoading.isVisible();
  if (!isLoading) {
    isAtBottom = true;
  }
}

const amountOfPosts = await page.locator("shreddit-post").count();
console.info(`Il y a ${amountOfPosts} posts.`); // 42

type PostData = {
  title: string | null;
  contentHref: string | null;
  permalink: string | null;
  createdAt: string | null;
  images?: string[];
};

const issues: PostData[] = [];

for (let i = 0; i < amountOfPosts; i++) {
  const postElement = page.locator("shreddit-post").nth(i);
  issues.push({
    title: await postElement.getAttribute("post-title"),
    contentHref: await postElement.getAttribute("content-href"),
    permalink: `https://reddit.com${await postElement.getAttribute("permalink")}`,
    createdAt: await postElement.getAttribute("created-timestamp"),
    images: [],
  });
}

for (const issue of issues) {
  const galleryUrl = issue?.contentHref;
  if (!galleryUrl) continue;

  await page.goto(galleryUrl);
  await page.waitForTimeout(2000);

  // Click the <a title="Next"> button until it's not visible anymore
  let isNextButtonVisible = true;
  while (isNextButtonVisible) {
    const nextButton = page.locator("a[title='Next']");
    isNextButtonVisible = await nextButton.isVisible();
    if (isNextButtonVisible) {
      await nextButton.click();
      await page.waitForTimeout(1000);
    }
  }

  // Get all the images and add them to the postData object
  const imgElements = page.locator("img");
  const imgCount = await imgElements.count();

  for (let j = 0; j < imgCount; j++) {
    const imgUrl = await imgElements.nth(j).getAttribute("src");
    if (imgUrl && !imgUrl.includes("renderTimingPixel")) {
      issue?.images?.push(imgUrl);
    }
  }

  const contentFileName = `${issue?.title?.toLowerCase().replace(/ /g, "_")}.mdx`;

  const tags = [];
  if (contentFileName.includes("lite")) tags.push("lite");
  if (contentFileName.replace("é", "e").includes("special"))
    tags.push("special");

  try {
    console.info(
      `Écriture du fichier ${contentFileName}... (${issues.indexOf(issue) + 1}/${issues.length})`,
    );
    await Bun.write(
      `./src/content/issues/${contentFileName}`,
      `---
title: "${issue?.title}"
date: "${issue?.createdAt}"
link: "${issue?.permalink}"
images: ${JSON.stringify(issue?.images)}
tags: ${JSON.stringify(tags)}
---`,
    );
  } catch (error) {
    console.error("Erreur lors de l'écriture du fichier", contentFileName);
    console.error(error);
  }
}

// let comments = await page.locator("div[slot='comment']").innerHTML();
// comments = comments.trim().replace(/\n/g, "").replace(/  +/g, " ");

await browser.close();
