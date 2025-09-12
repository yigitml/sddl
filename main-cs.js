!function(){"use strict";
const e=console.log,t=console.warn,o=console.error,n=console.assert;
const r=(...t)=>{e("%c[SD-D]","background: green; color: white; padding: 2px;",...t)};
const i=(...e)=>{t("%c[SD-D]","background: orange; color: black; padding: 2px;",...e)};
const c=(...e)=>{o("%c[SD-D]","background: red; color: white; padding: 2px;",...e)};
const a=(e,...t)=>{n(e,"%c[SD-D]","background: red; color: white; padding: 2px;",...t)};

var s;
const api=(()=>{try{if(chrome)return chrome}catch(e){}try{if(browser)return browser}catch(e){}})();

const d=document.documentElement.querySelector("#data-transfer-element");
a(null!==d,"No data Element found!");
const l=JSON.parse(null!==(s=null==d?void 0:d.getAttribute("data-transfer"))&&void 0!==s?s:'{"fallback":"THIS IS NOT GOOD"}');
null==d||d.remove();
r("Main-cs initializing with params:",l);
a(void 0===window.sdWinow,"sdWindow should not be set at this point.",window.sdWindow);

window.sdWindow=new Proxy({},{set(e,t,o,n){
  if("user"===t) {
    if(o&&"object"==typeof o) {
      try{
        Object.defineProperty(o,"is_premium",{value:!0,configurable:!1,writable:!1});
        r("Sucessfully installed is_premium override.");
      }catch(e){
        c("Could not define override for is_premium");
      }
    } else {
      i("Non-object value assigned to user property: %o%c\nIf everything works as expected this can safely be ignored.",o,"color:grey;font-style:italic;");
    }
  }
  return Reflect.set(e,t,o,n);
}});

// Function to extract original document name from page
function getOriginalFileName() {
  try {
    // Try multiple selectors to find the document title/name
    const selectors = [
      'h1', // Main page title
      '[data-testid="document-title"]',
      '.document-title',
      '.file-title',
      '.document-name',
      'title'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent?.trim()) {
        let title = element.textContent.trim();
        // Clean up the title - remove extra whitespace and non-filename characters
        title = title.replace(/\s+/g, ' ').replace(/[<>:"/\\|?*]/g, '');
        if (title && title !== 'StudyDrive') {
          // Make sure it has .pdf extension
          if (!title.toLowerCase().endsWith('.pdf')) {
            title += '.pdf';
          }
          r("Found original document name:", title);
          return title;
        }
      }
    }
    
    // Fallback: try to get from URL with better naming
    const urlMatch = window.location.href.match(/doc\/([^\/]+)/);
    if (urlMatch && urlMatch[1]) {
      const docId = urlMatch[1];
      // Try to make it more readable
      const cleanId = docId.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
      return `${cleanId}.pdf`;
    }
    
    return "document.pdf";
  } catch (error) {
    c("Error extracting filename:", error);
    return "document.pdf";
  }
}

const u=/.*studydrive\.net\/file-preview/g;
const p=window.dispatchEvent;
const w=CustomEvent;

const processResponse = async (responseData) => {
  try {
    const originalName = getOriginalFileName();
    const payload = {
      bytes: responseData,
      name: originalName
    };
    
    const eventName = await (async function(e){
      const t=(new TextEncoder).encode(e);
      const o=await crypto.subtle.digest("SHA-256",t);
      return Array.from(new Uint8Array(o)).map(e=>e.toString(16).padStart(2,"0")).join("");
    })(l.extId);
    
    p(new w(eventName, {detail: payload}));
    r("Send PDF Bytes with original name:", originalName);
  } catch(e) {
    c("Failed to send URL to the service worker.",e);
  }
};

// Set up hooks
try {
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    if (url.match(u)) {
      this.addEventListener("load", () => {
        processResponse(this.response);
      }, false);
    }
    originalXHROpen.apply(this, arguments);
  };
} catch(e) {
  c("Failed to set up XMLHttpRequest Hook", e);
}

try {
  let originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
    const response = await originalFetch(input, init);
    
    try {
      if (url.match(u)) {
        const clonedResponse = response.clone();
        processResponse(await clonedResponse.arrayBuffer());
      }
    } catch(e) {
      c("Failed to clone and process fetch response.", e);
    }
    
    return response;
  };
} catch(e) {
  c("Failed to set up Fetch hook", e);
}

}();
