import { useEffect, useState } from 'react'
import browser from 'webextension-polyfill'

function IndexPopup(): React.ReactNode {
  const [data, setData] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        })
        console.warn(tabs[0]?.url)
      }
      catch (err) {
        console.error(err)
      }
    })()
  }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2>Welcome to your Plasmo Extension!</h2>
      <input
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setData(e.target.value)}
        value={data}
      />
    </div>
  )
}

export default IndexPopup
