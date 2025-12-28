/* global getNormalizedId */
const base = 'https://en.wikipedia.org/w/api.php';

const domParser = new DOMParser();

/* Make a request to the Wikipedia API */
function queryApi(query) {
  const url = new URL(base);
  const params = { format: 'json', origin: '*', ...query };
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  return fetch(url).then(response => response.json());
}

/**
 * Get the title of a page from a URL quickly, but inaccurately (no redirects)
 */
const getPageTitleQuickly = url => url.split('/').filter(el => el).pop().split('#')[0];

/**
 * Get the name of a Wikipedia page accurately by following redirects (slow)
 */
function fetchPageTitle(page) {
  return queryApi({ action: 'query', titles: page, redirects: 1 })
    .then(res => Object.values(res.query.pages)[0].title);
}

/**
 * Decide whether the name of a wikipedia page is an article, or belongs to another namespace.
 * See https://en.wikipedia.org/wiki/Wikipedia:Namespace
 */
// Pages outside of main namespace have colons in the middle, e.g. 'WP:UA'
// Remove any trailing colons and return true if the result still contains a colon
const isArticle = name => !(name.endsWith(':') ? name.slice(0, -1) : name).includes(':');


// --- MAIN FUNCTIONS ---

/**
 * Get a DOM object for the HTML of a Wikipedia page.
 * Also returns information about any redirects that were followed.
 * @param {string} pageName - The title of the page
 * @param {number|null} section - The section to retrieve (0 for intro), or null for full page
 */
function getPageHtml(pageName, section = null) {
  const params = { action: 'parse', page: pageName, prop: 'text', redirects: 1 };
  if (section !== null) {
    params.section = section;
  }
  
  return queryApi(params)
    .then(res => ({
      document: domParser.parseFromString(res.parse.text['*'], 'text/html'),
      redirectedTo: res.parse.redirects && res.parse.redirects[0] ? res.parse.redirects[0].to : pageName,
    }));
}

/**
 * Get a DOM object for the first body paragraph in page HTML.
 * @param {HtmlElement} element - An HTML element as returned by `getPageHtml`
 */
const getFirstParagraph = element =>
  // First paragraph that isn't marked as "empty"...
  Array.from(element.querySelectorAll('.mw-parser-output > p:not(.mw-empty-elt)'))
    // ...and isn't the "coordinates" container
    .find(p => !p.querySelector('#coordinates'));

/**
 * Get the name of each Wikipedia article linked.
 * @param {HtmlElement} element - An HTML element to search for links within
 */
function getWikiLinks(element) {
  if (!element) return []; // Guard against null element
  const links = Array.from(element.querySelectorAll('a'))
    .map(link => link.getAttribute('href'))
    .filter(href => href && href.startsWith('/wiki/')) // Only links to Wikipedia articles
    .map(getPageTitleQuickly) // Get the title from the URL
    .filter(isArticle) // Make sure it's an article and not a part of another namespace
    .map(title => title.replace(/_/g, ' ')); // Replace underscores with spaces
  // Remove duplicates after normalizing
  const ids = links.map(getNormalizedId);
  const isUnique = ids.map((n, i) => ids.indexOf(n) === i); // 'true' in every spot that's unique
  return links.filter((n, i) => isUnique[i]);
}

/**
 * Filter a list of titles to only include people and characters.
 * Checks categories for keywords like 'births', 'deaths', 'people', 'characters'.
 */
async function filterPeople(titles) {
  if (titles.length === 0) return [];

  // Wikipedia API limit is 50 titles per request
  const chunks = [];
  const BATCH_SIZE = 50;
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    chunks.push(titles.slice(i, i + BATCH_SIZE));
  }

  const validTitles = new Set();

  for (const chunk of chunks) {
    try {
      const res = await queryApi({
        action: 'query',
        titles: chunk.join('|'),
        prop: 'categories',
        cllimit: 'max',
      });

      if (res.query && res.query.pages) {
        Object.values(res.query.pages).forEach(page => {
          if (page.categories) {
            const isPerson = page.categories.some(cat => {
              const c = cat.title.toLowerCase();
              return c.includes('births') ||
                     c.includes('deaths') ||
                     c.includes('people') ||
                     c.includes('characters') ||
                     c.includes('human');
            });
            if (isPerson) validTitles.add(page.title);
          }
        });
      }
    } catch (e) {
      console.warn('Wikipedia API error during filtering:', e);
    }
  }

  return titles.filter(t => validTitles.has(t));
}

/**
 * Given a page title, get linked pages.
 * Behavior depends on the 'People Only Mode' switch.
 */
function getSubPages(pageName) {
  // Check the switch state
  const peopleModeCheckbox = document.getElementById('people-mode');
  const isPeopleMode = peopleModeCheckbox && peopleModeCheckbox.checked;

  if (isPeopleMode) {
    // MODE: ON - Full page, filter for people.
    // OPTIMIZATION: We use the API to get links directly (prop=links) instead of 
    // parsing the entire HTML text. This solves memory/truncation issues on mobile.
    return queryApi({ action: 'parse', page: pageName, prop: 'links', redirects: 1 })
      .then(async (res) => {
        const redirectedTo = res.parse.redirects && res.parse.redirects[0] ? res.parse.redirects[0].to : pageName;
        
        // Extract titles from API response
        // The API returns an array of objects: { ns: 0, title: "Name", ... }
        // We only want ns: 0 (Main Article Namespace)
        const rawLinks = res.parse.links
          .filter(item => item.ns === 0)
          .map(item => item['*']);

        const links = await filterPeople(rawLinks);
        return { redirectedTo, links };
      })
      .catch((err) => {
        console.error('Error fetching full page links:', err);
        // Fallback or empty return on error
        return { redirectedTo: pageName, links: [] };
      });

  } else {
    // MODE: OFF - First paragraph only, no filter (Original behavior)
    return getPageHtml(pageName, 0).then(({ document: doc, redirectedTo }) => {
      const firstPara = getFirstParagraph(doc);
      // getFirstParagraph might return undefined if no suitable paragraph is found
      const links = firstPara ? getWikiLinks(firstPara) : [];
      return { redirectedTo, links };
    });
  }
}

/**
 * Get the name of a random Wikipedia article
 */
function getRandomArticle() {
  return queryApi({
    action: 'query',
    list: 'random',
    rnlimit: 1,
    rnnamespace: 0, // Limits results to articles
  }).then(res => res.query.random[0].title);
}

/**
 * Get completion suggestions for a query
 */
function getSuggestions(search) {
  return queryApi({
    action: 'opensearch',
    search,
    limit: 10,
    namespace: 0, // Limits results to articles
  })
    .then(res => res[1]);
}
