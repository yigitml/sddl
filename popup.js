!function() {
"use strict";

const api = (() => {
  try { if (chrome) return chrome; } catch (e) {}
  try { if (browser) return browser; } catch (e) {}
  return {};
})();

// Bulk download state
let bulkDownloadState = {
  isRunning: false,
  isPaused: false,
  urls: [],
  completed: 0,
  total: 0,
  currentUrl: null
};

// UI elements
const foundFilesCount = document.getElementById('found_files_count');
const downloadProgress = document.getElementById('download_progress');
const startBulkBtn = document.getElementById('start_bulk_btn');
const pauseBulkBtn = document.getElementById('pause_bulk_btn');
const stopBulkBtn = document.getElementById('stop_bulk_btn');
const progressBarFill = document.getElementById('progress_bar_fill');
const progressPercent = document.getElementById('progress_percent');
const progressCounter = document.getElementById('progress_counter');
const queueList = document.getElementById('queue_list');
const themeToggle = document.getElementById('theme_toggle');

// Tabs
const tabs = Array.from(document.querySelectorAll('.tab'));
const panels = Array.from(document.querySelectorAll('.panel'));

// Template for individual file display
const createFileHTML = (file) => 
  `<div><span>${file.name}</span><a href="${file.url}" target="_blank">Open</a><a href="${file.url}" target="_blank" download=${file.name}>Download</a></div>`;

// Initialize popup
async function initializePopup() {
  // Load individual PDF files
  await loadIndividualFiles();
  
  // Check current bulk download state first
  await syncBulkDownloadState();
  
  // Check for bulk download capability
  await checkBulkDownloadAvailability();
  
  // Setup event listeners
  setupEventListeners();

  // Setup tabs and theme
  setupTabs();
  setupTheme();
}

// Sync popup state with background script state
async function syncBulkDownloadState() {
  try {
    const response = await new Promise(resolve => {
      api.runtime.sendMessage({type: 'GET_BULK_DOWNLOAD_STATE'}, resolve);
    });
    
    if (response && response.isRunning) {
      // Download is in progress, update UI accordingly
      bulkDownloadState.isRunning = response.isRunning;
      bulkDownloadState.isPaused = response.isPaused;
      bulkDownloadState.completed = response.completed || 0;
      bulkDownloadState.total = response.total || 0;
      bulkDownloadState.urls = response.urls || [];
      
      // Update UI to reflect current state
      startBulkBtn.disabled = true;
      pauseBulkBtn.disabled = false;
      stopBulkBtn.disabled = false;
      
      if (response.isPaused) {
        startBulkBtn.textContent = 'Downloading... (Paused)';
        pauseBulkBtn.textContent = 'Resume';
      } else {
        startBulkBtn.textContent = 'Downloading...';
        pauseBulkBtn.textContent = 'Pause';
      }
      
      // Update progress display
      updateDownloadProgress({
        completed: response.completed || 0,
        total: response.total || 0,
        currentFile: response.isPaused ? 'Paused' : 'In progress...'
      });
      
      // Update file count display
      if (response.total > 0) {
        foundFilesCount.textContent = `Found ${response.total} file(s)`;
      }
    }
  } catch (error) {
    console.error("Error syncing bulk download state:", error);
  }
}

// Load individual PDF files (existing functionality)
async function loadIndividualFiles() {
  try {
    const response = await new Promise(resolve => {
      api.runtime.sendMessage({type: "GET_ALL_PDF_TYPE"}, resolve);
    });
    
    console.log("ALL PDFS", response);
    
    const currentElement = document.getElementById("current");
    const otherElement = document.getElementById("other");
    
    if (!currentElement || !otherElement) {
      throw new Error("Could not find list elements");
    }
    
    // Display current PDF
    if (response.currentPdf) {
      currentElement.innerHTML = currentElement.innerHTML + createFileHTML(response.currentPdf);
    }
    
    // Display other PDFs
    for (const pdf of Object.values(response.otherPdfs).reverse()) {
      otherElement.innerHTML += createFileHTML(pdf);
    }
    
    // Setup message listener for live updates
    const port = api.runtime.connect();
    port.onMessage.addListener(message => {
      if (message.isCurrent) {
        const currentElement = document.getElementById("current");
        if (!currentElement) throw new Error("Could not find current list element");
        if (message.pdf) {
          currentElement.innerHTML = createFileHTML(message.pdf) + currentElement.innerHTML;
        }
      } else {
        const otherElement = document.getElementById("other");
        if (!otherElement) throw new Error("Could not find other list element");
        if (message.pdf) {
          otherElement.innerHTML = createFileHTML(message.pdf) + otherElement.innerHTML;
        }
      }
    });
    
  } catch (error) {
    console.error("Error loading individual files:", error);
  }
}

// Check if current tab supports bulk download
async function checkBulkDownloadAvailability() {
  try {
    const tabs = await api.tabs.query({active: true, currentWindow: true});
    if (!tabs.length) {
      foundFilesCount.textContent = "No active tab";
      return;
    }
    
    const tab = tabs[0];
    
    // Check if we can access the tab (extension pages, etc. can't be accessed)
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('moz-extension://') || tab.url.startsWith('about:')) {
      foundFilesCount.textContent = "Cannot access this page";
      return;
    }
    
    // Check if it's a studydrive page
    if (!tab.url.includes('studydrive.net')) {
      foundFilesCount.textContent = "Not on StudyDrive";
      return;
    }
    
    // Inject script to check for files and get the capability
    if (api.scripting && api.scripting.executeScript) {
      const results = await api.scripting.executeScript({
        target: {tabId: tab.id},
        func: checkForDownloadableFiles
      });
      
      if (results && results[0] && results[0].result) {
        const fileInfo = results[0].result;
        updateBulkDownloadUI(fileInfo);
      }
    } else {
      // Fallback - send message to content script instead
      api.tabs.sendMessage(tab.id, {type: 'CHECK_BULK_DOWNLOAD'}, (response) => {
        if (api.runtime.lastError) {
          foundFilesCount.textContent = "Page not ready";
          return;
        }
        if (response) {
          updateBulkDownloadUI(response);
        }
      });
    }
    
  } catch (error) {
    console.error("Error checking bulk download availability:", error);
    foundFilesCount.textContent = "Unable to check files";
  }
}

// Function to inject into the page to check for files
function checkForDownloadableFiles() {
  // Check if we're on a course page
  const href = location.href;
  const isCoursePage = /studydrive\.net\/.+\/course\//.test(href) && 
                      (href.includes('#documents') || href.includes('documents'));
  
  if (!isCoursePage) {
    return {
      isCoursePage: false,
      fileCount: 0,
      urls: []
    };
  }
  
  // Collect file links
  const urls = new Set();
  const selectors = [
    'a[href*="/file-preview/"]',
    'a[href*="/document/"]', 
    'a[href*="/doc/"]',
    'a[href*="/file/"]'
  ];
  
  for (const selector of selectors) {
    const anchors = [...document.querySelectorAll(selector)];
    anchors.forEach(a => {
      const u = a.getAttribute('href') || '';
      if (!u) return;
      const abs = u.startsWith('http') ? u : new URL(u, location.origin).toString();
      urls.add(abs);
    });
  }
  
  // If no specific links found, look for any links that might be documents
  if (urls.size === 0) {
    const allLinks = [...document.querySelectorAll('a[href]')];
    allLinks.forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.includes('.pdf') || href.match(/\/doc\/|\/document\/|\/file\//)) {
        const abs = href.startsWith('http') ? href : new URL(href, location.origin).toString();
        urls.add(abs);
      }
    });
  }
  
  return {
    isCoursePage: true,
    fileCount: urls.size,
    urls: Array.from(urls)
  };
}

// Update bulk download UI based on file availability
function updateBulkDownloadUI(fileInfo) {
  if (!fileInfo.isCoursePage) {
    foundFilesCount.textContent = "Not on a course documents page";
    // Only disable if no download is running
    if (!bulkDownloadState.isRunning) {
      startBulkBtn.disabled = true;
    }
    return;
  }
  
  if (fileInfo.fileCount === 0) {
    foundFilesCount.textContent = "No downloadable files found";
    // Only disable if no download is running
    if (!bulkDownloadState.isRunning) {
      startBulkBtn.disabled = true;
    }
  } else {
    // Only update file count if not currently downloading (to preserve download progress display)
    if (!bulkDownloadState.isRunning) {
      foundFilesCount.textContent = `Found ${fileInfo.fileCount} file(s)`;
      startBulkBtn.disabled = false;
      bulkDownloadState.urls = fileInfo.urls;
      bulkDownloadState.total = fileInfo.fileCount;
    } else {
      // If download is running, just update the available URLs for potential future use
      if (bulkDownloadState.urls.length === 0) {
        bulkDownloadState.urls = fileInfo.urls;
      }
    }
  }
}

// Setup event listeners for bulk download controls
function setupEventListeners() {
  startBulkBtn.addEventListener('click', startBulkDownload);
  pauseBulkBtn.addEventListener('click', pauseBulkDownload);
  stopBulkBtn.addEventListener('click', stopBulkDownload);
  
  // Listen for bulk download progress updates
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'BULK_DOWNLOAD_PROGRESS') {
      updateDownloadProgress(message.progress);
    } else if (message.type === 'BULK_DOWNLOAD_COMPLETE') {
      onBulkDownloadComplete(message.result);
    }
  });
}

// Tabs setup
function setupTabs() {
  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.id));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const idx = tabs.indexOf(tab);
        const next = tabs[(idx + dir + tabs.length) % tabs.length];
        next.focus();
        activateTab(next.id);
      }
    });
  });
}

function activateTab(tabId) {
  tabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.id === tabId)));
  panels.forEach(panel => panel.classList.add('is-hidden'));
  const selected = tabId.replace('tab', 'panel');
  const panel = document.getElementById(selected);
  if (panel) panel.classList.remove('is-hidden');
}

// Theme setup
function setupTheme() {
  try {
    const stored = localStorage.getItem('sddl_theme');
    const isDark = stored !== 'light';
    if (themeToggle) themeToggle.checked = isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    themeToggle?.addEventListener('change', () => {
      const dark = themeToggle.checked;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      localStorage.setItem('sddl_theme', dark ? 'dark' : 'light');
    });
  } catch (_) {}
}

// Start bulk download
async function startBulkDownload() {
  if (bulkDownloadState.urls.length === 0) {
    alert('No files to download');
    return;
  }
  
  bulkDownloadState.isRunning = true;
  bulkDownloadState.isPaused = false;
  bulkDownloadState.completed = 0;
  
  // Update UI
  startBulkBtn.disabled = true;
  pauseBulkBtn.disabled = false;
  stopBulkBtn.disabled = false;
  startBulkBtn.textContent = 'Downloading...';
  
  // Send message to background script to start download
  api.runtime.sendMessage({
    type: 'START_BULK_DOWNLOAD',
    urls: bulkDownloadState.urls
  });
  
  updateDownloadProgress({completed: 0, total: bulkDownloadState.total});
}

// Pause bulk download
function pauseBulkDownload() {
  if (!bulkDownloadState.isRunning) return;
  
  bulkDownloadState.isPaused = !bulkDownloadState.isPaused;
  
  // Update UI
  pauseBulkBtn.textContent = bulkDownloadState.isPaused ? 'Resume' : 'Pause';
  startBulkBtn.textContent = bulkDownloadState.isPaused ? 'Downloading... (Paused)' : 'Downloading...';
  
  // Send message to background script
  api.runtime.sendMessage({
    type: 'PAUSE_BULK_DOWNLOAD',
    paused: bulkDownloadState.isPaused
  }, (response) => {
    if (response && response.paused !== undefined) {
      // Sync with actual background state in case of mismatch
      bulkDownloadState.isPaused = response.paused;
      pauseBulkBtn.textContent = response.paused ? 'Resume' : 'Pause';
      startBulkBtn.textContent = response.paused ? 'Downloading... (Paused)' : 'Downloading...';
    }
  });
}

// Stop bulk download
function stopBulkDownload() {
  if (!bulkDownloadState.isRunning) return;
  
  bulkDownloadState.isRunning = false;
  bulkDownloadState.isPaused = false;
  
  // Update UI
  resetBulkDownloadUI();
  
  // Send message to background script
  api.runtime.sendMessage({
    type: 'STOP_BULK_DOWNLOAD'
  }, (response) => {
    // Ensure UI is properly reset
    resetBulkDownloadUI();
  });
}

// Update download progress display
function updateDownloadProgress(progress) {
  bulkDownloadState.completed = progress.completed;
  const total = progress.total || bulkDownloadState.total || 0;
  const completed = progress.completed || 0;
  downloadProgress.textContent = `Progress: ${completed}/${total}`;
  const percent = total > 0 ? Math.floor((completed / total) * 100) : 0;
  if (progressBarFill) progressBarFill.style.width = `${percent}%`;
  if (progressPercent) progressPercent.textContent = `${percent}%`;
  if (progressCounter) progressCounter.textContent = `${completed}/${total}`;
  
  if (progress.currentFile) {
    downloadProgress.textContent += ` - ${progress.currentFile}`;
  }

  // Update queue preview if we have URLs
  renderQueue();
}

// Handle bulk download completion
function onBulkDownloadComplete(result) {
  bulkDownloadState.isRunning = false;
  bulkDownloadState.isPaused = false;
  
  resetBulkDownloadUI();
  
  if (result.completed === result.total) {
    downloadProgress.textContent = `Completed! Downloaded ${result.completed} files`;
    downloadProgress.style.color = '#28a745';
  } else {
    downloadProgress.textContent = `Finished with ${result.completed}/${result.total} files downloaded`;
    downloadProgress.style.color = '#ffc107';
  }
  
  // Reset after a delay
  setTimeout(() => {
    downloadProgress.textContent = '';
    downloadProgress.style.color = '#28a745';
  }, 5000);

  // Clear progress bar and queue
  if (progressBarFill) progressBarFill.style.width = '0%';
  if (progressPercent) progressPercent.textContent = '0%';
  if (progressCounter) progressCounter.textContent = '0/0';
  if (queueList) queueList.innerHTML = '';
}

// Reset bulk download UI
function resetBulkDownloadUI() {
  startBulkBtn.disabled = bulkDownloadState.urls.length === 0;
  pauseBulkBtn.disabled = true;
  stopBulkBtn.disabled = true;
  startBulkBtn.textContent = 'Start Download';
  pauseBulkBtn.textContent = 'Pause';
}

// Render a simple queue preview
function renderQueue() {
  if (!queueList || !Array.isArray(bulkDownloadState.urls)) return;
  const remaining = bulkDownloadState.urls.slice(bulkDownloadState.completed);
  const maxItems = 10;
  queueList.innerHTML = '';
  remaining.slice(0, maxItems).forEach((url) => {
    const div = document.createElement('div');
    div.className = 'queue__item';
    div.innerHTML = `<span class="queue__dot"></span><span title="${url}">` + (url.split('/').pop() || url) + '</span>';
    queueList.appendChild(div);
  });
  if (remaining.length > maxItems) {
    const more = document.createElement('div');
    more.className = 'queue__item';
    more.textContent = `+${remaining.length - maxItems} more`;
    queueList.appendChild(more);
  }
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', initializePopup);

}();