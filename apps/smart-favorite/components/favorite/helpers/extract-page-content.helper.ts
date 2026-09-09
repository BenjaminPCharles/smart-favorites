import browser from 'webextension-polyfill'

/**
 * Reads the visible page text, closing over nothing since it is serialized into the tab.
 */
function extractPageContent(): string {
  const main = document.querySelector('article, main, [role="main"]') ?? document.body
  const excluded = 'script, style, nav, header, footer, aside, noscript, [hidden], [aria-hidden="true"]'

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

  return parts.join(' ').replace(/\s+/g, ' ').slice(0, 20_000)
}

/**
 * Injects the extractor into a tab, resolving null wherever injection is refused.
 */
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
