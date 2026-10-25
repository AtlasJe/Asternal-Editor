export async function loadProject(url = '/project.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar el proyecto: ${response.status}`);
  return response.json();
}

export async function loadScene(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar la escena: ${response.status}`);
  return response.json();
}
