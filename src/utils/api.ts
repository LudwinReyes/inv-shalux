export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: "include"
  });
  
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("text/html")) {
    const text = await res.text();
    const snippet = text.substring(0, 150);
    throw new Error(`IAP_PROXY_ERROR: Status ${res.status}. URL: ${url}. HTML: ${snippet}`);
  }
  
  if (!res.ok) {
    const text = await res.text();
    let errData;
    try {
      errData = JSON.parse(text);
    } catch (e) {
      throw new Error(`Error del servidor (Status: ${res.status}). Detalle: ${text.substring(0, 100)}...`);
    }
    throw new Error(errData.error || 'Error en la petición');
  }
  
  return res.json();
}
