!function(){
"use strict";
const api=(()=>{try{if(chrome)return chrome}catch(e){}try{if(browser)return browser}catch(e){}return{}})();

function isCoursePage(){
  const href=location.href;
  // Check if we're on a course page with documents
  return /studydrive\.net\/.+\/course\//.test(href) && (href.includes('#documents') || href.includes('documents'));
}

function collectFilePreviewLinks(){
  const urls=new Set();
  
  // File extensions to skip (non-PDF files)
  const skipExtensions = ['.apkg', '.bin', '.zip'];
  
  function shouldSkipUrl(url) {
    const urlLower = url.toLowerCase();
    return skipExtensions.some(ext => urlLower.includes(ext));
  }
  
  // Look for document links - try multiple selectors
  const selectors = [
    'a[href*="/file-preview/"]',
    'a[href*="/document/"]', 
    'a[href*="/doc/"]',
    'a[href*="/file/"]'
  ];
  
  for(const selector of selectors) {
    const anchors=[...document.querySelectorAll(selector)];
    anchors.forEach(a=>{
      const u=a.getAttribute('href')||'';
      if(!u) return;
      const abs=u.startsWith('http')?u:new URL(u,location.origin).toString();
      
      // Skip files with non-PDF extensions
      if (!shouldSkipUrl(abs)) {
        urls.add(abs);
      }
    });
  }
  
  // If no specific links found, look for any links that might be documents
  if(urls.size === 0) {
    const allLinks = [...document.querySelectorAll('a[href]')];
    allLinks.forEach(a => {
      const href = a.getAttribute('href') || '';
      if(href.includes('.pdf') || href.match(/\/doc\/|\/document\/|\/file\//)) {
        const abs=href.startsWith('http')?href:new URL(href,location.origin).toString();
        
        // Skip files with non-PDF extensions
        if (!shouldSkipUrl(abs)) {
          urls.add(abs);
        }
      }
    });
  }
  
  return Array.from(urls);
}

// Bulk download functionality has been moved to the extension popup
// This file now only provides utility functions for detecting course pages and collecting file links

// Add message listener for popup communication
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_BULK_DOWNLOAD') {
    const isCoursePage_result = isCoursePage();
    if (!isCoursePage_result) {
      sendResponse({
        isCoursePage: false,
        fileCount: 0,
        urls: []
      });
      return;
    }
    
    const urls = collectFilePreviewLinks();
    sendResponse({
      isCoursePage: true,
      fileCount: urls.length,
      urls: urls
    });
  }
});

// The page detection and link collection functions are kept for potential future use
// but the UI button is removed as per user request to move functionality to popup
}();


