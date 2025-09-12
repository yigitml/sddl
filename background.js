const e=console.log,s=console.warn,t=console.error,r=(console.assert,(...s)=>{e("%c[SD-D]","background: green; color: white; padding: 2px;",...s)}),a=(...e)=>{s("%c[SD-D]","background: orange; color: black; padding: 2px;",...e)},n=(...e)=>{t("%c[SD-D]","background: red; color: white; padding: 2px;",...e)},o=(()=>{try{if(chrome)return chrome}catch(e){}try{if(browser)return browser}catch(e){}return{}})(),d=async(e,s)=>{var t,d;switch(r("Handle Message",e,s),e.type){case"NEWPDFBYTES":const l=URL.createObjectURL(new Blob([e.bytes],{type:"application/pdf"})),u={name:e.name,url:l};e.pdf=u;case"NEWPDF":const p=(await o.storage.session.get(["pdfs"]))?.pdfs||{};if(!(null===(t=s.tab)||void 0===t?void 0:t.id))return void a("Message received without tab id");const f=s.tab.id;if(p[f]=e.pdf,o.storage.session.set({pdfs:p},()=>{r("PDF for tab ID",f,"updated in session storage.")}),c){const s={pdf:e.pdf,isCurrent:await i()===f};try{c.postMessage(s)}catch(e){r("Failed to send Update"),c=void 0}}break;case"GET_ALL_PDF_TYPE":try{const e=await i(),s=(await o.storage.session.get(["pdfs"]))?.pdfs||{},t=s[e];e&&delete s[e];const a={otherPdfs:s,currentPdf:t};return r("Responding with",{response:a}),a}catch(e){n("Error handling GET_ALL_PDF_TYPE:",e)}case"GET_PDF_FOR_CURRENT_TAB":{const e=null===(d=s.tab)||void 0===d?void 0:d.id;if(e){return((await o.storage.session.get(["pdfs"]))?.pdfs||{})[e]}return null}case"DOWNLOAD_PDF":{const s=e.pdf;s&&s.url?(r("Received DOWNLOAD_PDF request. Starting download for:",s.name),o.downloads.download({url:s.url,filename:s.name,saveAs:!0},e=>{o.runtime.lastError?n("DOWNLOAD FAILED! Error:",o.runtime.lastError.message):r("Download initiated successfully. ID:",e)})):a("DOWNLOAD_PDF message received without a valid pdf.");break}default:a("Unhandled message",e)}},i=async()=>{const e=await o.tabs.query({active:!0,currentWindow:!0});if(e.length>0){return e[0].id}};let c;o.runtime.onMessage.addListener((e,s,t)=>((async()=>{t(await d(e,s))})(),!0)),o.runtime.onMessageExternal.addListener((e,s,t)=>((async()=>{t(await d(e,s))})(),!0)),o.runtime.onConnect.addListener(e=>{c=e,e.onDisconnect.addListener(()=>{c===e&&(c=void 0),r("Disconnected port from service worker.")})}),o.tabs.onUpdated.addListener((e,s,t)=>{s.url||l(e)});const l=async e=>{const s=(await o.storage.session.get(["pdfs"]))?.pdfs||{},t=s[e];t&&(delete s[e],o.storage.session.set({pdfs:s.pdfs},()=>{r("Deleted for tabId",e)}),URL.revokeObjectURL(t.url),r("Revoked Object Url for",t.name))};

// ENHANCED BULK DOWNLOAD HANDLER
const BATCH_SIZE = 20; // Configurable batch size - change this to experiment with different values

// File extensions to skip (non-PDF files)
const SKIP_EXTENSIONS = ['.apkg', '.bin', '.zip'];

// Function to check if a file should be skipped based on URL or extension
function shouldSkipFile(url) {
  try {
    const urlLower = url.toLowerCase();
    return SKIP_EXTENSIONS.some(ext => urlLower.includes(ext));
  } catch (err) {
    return false;
  }
}

let bulkDownloadController = {
  isRunning: false,
  isPaused: false,
  shouldStop: false,
  currentUrls: [],
  completed: 0,
  total: 0,
  activeTabIds: new Set(),
  currentBatch: 0,
  totalBatches: 0
};

// Enhanced bulk download with batch processing and pause/stop functionality
async function handleBulkDownload(urls, sendProgress) {
  bulkDownloadController.isRunning = true;
  bulkDownloadController.isPaused = false;
  bulkDownloadController.shouldStop = false;
  
  // Filter out files with extensions we should skip
  const filteredUrls = urls.filter(url => {
    const shouldSkip = shouldSkipFile(url);
    if (shouldSkip) {
      r("Skipping non-PDF file:", url);
    }
    return !shouldSkip;
  });
  
  bulkDownloadController.currentUrls = [...filteredUrls];
  bulkDownloadController.completed = 0;
  bulkDownloadController.total = filteredUrls.length;
  bulkDownloadController.activeTabIds.clear();
  bulkDownloadController.currentBatch = 0;
  bulkDownloadController.totalBatches = Math.ceil(filteredUrls.length / BATCH_SIZE);
  
  // If we filtered out files, let the user know
  const skippedCount = urls.length - filteredUrls.length;
  if (skippedCount > 0) {
    sendProgress({
      completed: 0,
      total: filteredUrls.length,
      currentFile: `Skipped ${skippedCount} non-PDF files. Processing ${filteredUrls.length} PDF files...`
    });
    await new Promise(res => setTimeout(res, 2000)); // Show message for 2 seconds
  }

  try {
    // Process URLs in batches
    for (let batchIndex = 0; batchIndex < filteredUrls.length; batchIndex += BATCH_SIZE) {
      bulkDownloadController.currentBatch = Math.floor(batchIndex / BATCH_SIZE) + 1;
      
      // Check for stop before starting new batch
      if (bulkDownloadController.shouldStop) {
        break;
      }

      // Get current batch of URLs
      const batchUrls = filteredUrls.slice(batchIndex, batchIndex + BATCH_SIZE);
      
      r(`Starting batch ${bulkDownloadController.currentBatch}/${bulkDownloadController.totalBatches} with ${batchUrls.length} files`);
      
      // Send batch progress update
      sendProgress({
        completed: bulkDownloadController.completed,
        total: bulkDownloadController.total,
        currentFile: `Batch ${bulkDownloadController.currentBatch}/${bulkDownloadController.totalBatches}: Starting ${batchUrls.length} files...`
      });

      // Process batch in parallel
      const batchPromises = batchUrls.map((url, urlIndex) => 
        processSingleFile(url, batchIndex + urlIndex, sendProgress)
      );

      // Wait for all files in current batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Count successful completions in this batch
      const batchCompleted = batchResults.filter(result => result.status === 'fulfilled' && result.value === true).length;
      bulkDownloadController.completed += batchCompleted;
      
      r(`Batch ${bulkDownloadController.currentBatch} completed: ${batchCompleted}/${batchUrls.length} files successful`);
      
      // Send batch completion progress
      sendProgress({
        completed: bulkDownloadController.completed,
        total: bulkDownloadController.total,
        currentFile: `Batch ${bulkDownloadController.currentBatch}/${bulkDownloadController.totalBatches} completed`
      });
      
      // Small delay between batches to avoid overwhelming the system
      if (batchIndex + BATCH_SIZE < filteredUrls.length && !bulkDownloadController.shouldStop) {
        await new Promise(res => setTimeout(res, 500));
      }
    }
    
  } catch (err) { 
    n("BULK failed", err); 
  } finally {
    // Cleanup any remaining tabs
    for (const tabId of bulkDownloadController.activeTabIds) {
      try {
        await o.tabs.remove(tabId);
      } catch (_) {}
    }
    bulkDownloadController.activeTabIds.clear();
    bulkDownloadController.isRunning = false;
  }

  return {
    completed: bulkDownloadController.completed,
    total: bulkDownloadController.total,
    stopped: bulkDownloadController.shouldStop
  };
}

// Process a single file with retry logic (extracted from the main loop for parallel processing)
async function processSingleFile(url, fileIndex, sendProgress) {
  // Double-check if this file should be skipped
  if (shouldSkipFile(url)) {
    r("Skipping file based on extension:", url);
    return true; // Return true to count as "processed" but skipped
  }
  
  const maxRetries = 1;
  let currentRetry = 0;
  
  while (currentRetry <= maxRetries) {
    try {
      // Check for pause/stop before processing each file
      while (bulkDownloadController.isPaused && !bulkDownloadController.shouldStop) {
        await new Promise(res => setTimeout(res, 500));
      }
      
      if (bulkDownloadController.shouldStop) {
        return false;
      }

      const retryText = currentRetry > 0 ? ` (Retry ${currentRetry}/${maxRetries})` : '';
      
      // Send progress update for current file
      sendProgress({
        completed: bulkDownloadController.completed,
        total: bulkDownloadController.total,
        currentFile: `Batch ${bulkDownloadController.currentBatch}/${bulkDownloadController.totalBatches}: Processing file ${fileIndex + 1}${retryText}`
      });

      r(`Creating tab for URL (attempt ${currentRetry + 1}):`, url);
      const tab = await o.tabs.create({url, active: false});
      const tabId = tab && tab.id;
      if (!tabId) {
        a("Failed to create tab for URL:", url);
        throw new Error("Failed to create tab");
      }
      
      r("Created tab with ID:", tabId);
      bulkDownloadController.activeTabIds.add(tabId);
      
      // Wait for the tab to load
      await new Promise(res => setTimeout(res, 3000));
      
      const start = Date.now();
      let ready = false;
      let checkCount = 0;
      
      // Wait for PDF to be processed (with shorter timeout for retries)
      const timeoutDuration = currentRetry === 0 ? 15000 : 10000; // 30s first try, 15s for retries
      while (Date.now() - start < timeoutDuration) {
        // Check for stop/pause during waiting
        while (bulkDownloadController.isPaused && !bulkDownloadController.shouldStop) {
          await new Promise(res => setTimeout(res, 500));
        }
        
        if (bulkDownloadController.shouldStop) {
          r("Stop requested, breaking out of wait loop");
          throw new Error("Stop requested");
        }
        
        try {
          const st = (await o.storage.session.get(["pdfs"]))?.pdfs || {};
          checkCount++;
          if (checkCount % 5 === 0) { // Log every 5 checks (5 seconds)
            r("Checking for PDF in session storage, attempt", checkCount, "for tab", tabId);
          }
          if (st[tabId]) { 
            r("PDF found for tab", tabId, ":", st[tabId].name);
            ready = true; 
            break; 
          }
        } catch (err) {
          a("Error checking session storage:", err);
        }
        await new Promise(res => setTimeout(res, 1000));
      }
      
      if (bulkDownloadController.shouldStop) {
        throw new Error("Stop requested");
      }
      
      let downloadSuccess = false;
      if (ready) {
        try {
          const st = (await o.storage.session.get(["pdfs"]))?.pdfs || {};
          const pdf = st[tabId];
          if (pdf && pdf.url) {
            r("Starting download for:", pdf.name);
            
            // Update progress with actual filename
            sendProgress({
              completed: bulkDownloadController.completed,
              total: bulkDownloadController.total,
              currentFile: `Downloading: ${pdf.name}${retryText}`
            });
            
            await new Promise((resolve, reject) => { 
              const timeout = setTimeout(() => {
                reject(new Error("Download timeout"));
              }, 2000); // Shorter timeout for retries
              
              o.downloads.download({
                url: pdf.url, 
                filename: pdf.name, 
                saveAs: false
              }, (downloadId) => {
                clearTimeout(timeout);
                if (o.runtime.lastError) {
                  n("Download failed:", o.runtime.lastError.message);
                  reject(new Error(o.runtime.lastError.message));
                } else {
                  r("Download started with ID:", downloadId);
                  resolve(downloadId);
                }
              }); 
            });
            downloadSuccess = true;
          } else {
            throw new Error("No PDF found for tab");
          }
        } catch (err) { 
          n("Download step failed", err);
          throw err;
        }
      } else {
        throw new Error(`PDF not ready for tab ${tabId} after ${timeoutDuration/1000} seconds`);
      }
      
      // Cleanup tab
      try { 
        if (tabId) {
          await o.tabs.remove(tabId); 
          bulkDownloadController.activeTabIds.delete(tabId);
        }
      } catch (_) {}
      
      // Cleanup session storage
      try {
        const st = (await o.storage.session.get(["pdfs"]))?.pdfs || {};
        if (st[tabId]) { 
          URL.revokeObjectURL(st[tabId].url); 
          delete st[tabId]; 
          await o.storage.session.set({pdfs: st}); 
        }
      } catch (_) {}
      
      // If we get here, download was successful
      return downloadSuccess;
      
    } catch (err) { 
      // Cleanup tab on error
      try { 
        const tabs = await o.tabs.query({});
        const tabsToRemove = tabs.filter(tab => tab.url === url && bulkDownloadController.activeTabIds.has(tab.id));
        for (const tab of tabsToRemove) {
          await o.tabs.remove(tab.id);
          bulkDownloadController.activeTabIds.delete(tab.id);
        }
      } catch (_) {}
      
      currentRetry++;
      
      if (currentRetry <= maxRetries) {
        a(`File processing failed (attempt ${currentRetry}/${maxRetries + 1}), retrying:`, err.message);
        // Short delay before retry
        await new Promise(res => setTimeout(res, 500));
      } else {
        a(`File processing failed after ${maxRetries + 1} attempts:`, err.message);
        return false;
      }
    }
  }
  
  return false;
}

// Message handlers for bulk download
try {
  o.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const sendProgress = (progress) => {
      try {
        o.runtime.sendMessage({
          type: 'BULK_DOWNLOAD_PROGRESS',
          progress: progress
        });
      } catch (err) {
        // Popup might be closed, ignore
      }
    };

    switch (msg.type) {
      case "GET_BULK_DOWNLOAD_STATE":
        sendResponse({
          isRunning: bulkDownloadController.isRunning,
          isPaused: bulkDownloadController.isPaused,
          completed: bulkDownloadController.completed,
          total: bulkDownloadController.total,
          urls: bulkDownloadController.currentUrls
        });
        break;

      case "START_BULK_DOWNLOAD":
        if (bulkDownloadController.isRunning) {
          sendResponse({error: "Download already in progress"});
          return;
        }
        
        (async () => {
          try {
            const urls = Array.isArray(msg.urls) ? msg.urls : [];
            const result = await handleBulkDownload(urls, sendProgress);
            
            // Send completion message
            try {
              o.runtime.sendMessage({
                type: 'BULK_DOWNLOAD_COMPLETE',
                result: result
              });
            } catch (err) {
              // Popup might be closed, ignore
            }
            
            sendResponse(result);
          } catch (err) {
            n("BULK failed", err);
            const errorResult = {
              completed: bulkDownloadController.completed,
              total: bulkDownloadController.total,
              error: true
            };
            
            try {
              o.runtime.sendMessage({
                type: 'BULK_DOWNLOAD_COMPLETE',
                result: errorResult
              });
            } catch (_) {}
            
            sendResponse(errorResult);
          }
        })();
        return true;

      case "PAUSE_BULK_DOWNLOAD":
        if (bulkDownloadController.isRunning) {
          bulkDownloadController.isPaused = msg.paused;
          sendResponse({paused: bulkDownloadController.isPaused});
        }
        break;

      case "STOP_BULK_DOWNLOAD":
        if (bulkDownloadController.isRunning) {
          bulkDownloadController.shouldStop = true;
          bulkDownloadController.isPaused = false;
          sendResponse({stopped: true});
        }
        break;

      // Keep legacy support for direct URL bulk downloads
      case "BULK_DOWNLOAD_URLS":
        if (bulkDownloadController.isRunning) {
          sendResponse({error: "Download already in progress"});
          return;
        }
        
        (async () => {
          try {
            const urls = Array.isArray(msg.urls) ? msg.urls : [];
            const result = await handleBulkDownload(urls, () => {}); // No progress for legacy
            sendResponse(result);
          } catch (err) {
            n("BULK failed", err);
            sendResponse({completed: 0, total: 0, error: true});
          }
        })();
        return true;
    }
  });
} catch (err) { 
  n("Failed to register bulk handler", err); 
}
