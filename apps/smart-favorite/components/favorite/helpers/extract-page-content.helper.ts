import browser from 'webextension-polyfill'

// Serialized and injected into the page, so it can close over nothing: no import, no
// module constant, no helper from this file. Everything it uses is inline.
function extractPageContent(): string {
  const main = document.querySelector('article, main, [role="main"]') ?? document.body
  const excluded = 'script, style, nav, header, footer, aside, noscript, [hidden], [aria-hidden="true"]'

  // Walking the live DOM rather than a detached clone: a clone is not rendered, and text
  // nodes joined by spaces keep the word boundaries a concatenation would lose
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
  const parts: string[] = []
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement
    if (!parent || parent.closest(excluded)) {
      continue
    }

    const value = walker.currentNode.nodeValue?.trim()
    if (value) {
      parts.push(value)
    }
  }

  // Bounded before it goes over the network, chunking is the server's job
  return parts.join(' ').replace(/\s+/g, ' ').slice(0, 20_000)
}

// Injection is refused on chrome://, the Web Store and the PDF viewer, and the tab can
// navigate away mid-call. Saving the favorite matters more than its content, so a failure
// resolves to null instead of throwing.
export async function readPageContent(tabId: number | undefined): Promise<string | null> {
  if (tabId === undefined) {
    return null
  }

  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId },
      func: extractPageContent,
    })

    return injection?.result as string ?? null
  }
  catch {
    return null
  }
}
