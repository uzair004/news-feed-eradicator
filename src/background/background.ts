// Background service worker for News Feed Eradicator
import { createBackgroundStore } from './store/store';
import { getBrowser, TabId } from '../webextension';
import { Sites } from '../sites';

// Add type declaration for document.nfeScriptsInjected
declare global {
  interface Document {
    nfeScriptsInjected?: boolean;
  }
}

createBackgroundStore();

const browser = getBrowser();

// Handle browser action click
browser.action.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

// Track which tabs are currently being processed
const tabMutex = new Set<number>();

// Function to inject scripts and CSS
const injectScripts = async (tabId: TabId) => {
  // Ensures we're only running this listener once per tab simultaneously
  if (tabMutex.has(tabId)) return;
  tabMutex.add(tabId);

  try {
    // Get tab info to check URL
    const tab = await browser.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith('http')) {
      return; // Skip non-http tabs
    }

    // Parse the URL to get the host
    const url = new URL(tab.url);
    const host = url.host;

    // Check if the script has already been injected
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => ({ 
        loaded: Boolean(document.nfeScriptsInjected) 
      })
    });

    if (results && results[0] && !results[0].result.loaded) {
      // Inject main CSS
      await browser.scripting.insertCSS({
        target: { tabId },
        files: ['eradicate.css']
      });

      // Site specific CSS
      for (const siteKey in Sites) {
        const site = Sites[siteKey];
        if (host.endsWith(site.domain) && site.css) {
          await browser.scripting.insertCSS({
            target: { tabId },
            css: site.css
          });
        }
      }

      // Inject the script
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['intercept.js']
      });

      // Mark as injected
      await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
          document.nfeScriptsInjected = true;
        }
      });
    }
  } catch (error) {
    console.error('Error injecting scripts:', error);
  } finally {
    tabMutex.delete(tabId);
  }
};

// Register the listeners
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    injectScripts(tabId);
  }
});

// Log that the service worker has started
console.log('News Feed Eradicator service worker initialized');