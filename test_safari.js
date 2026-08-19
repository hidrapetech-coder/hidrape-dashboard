try {
  fetch('/api/auth/config', {
      method: 'PUT',
      body: JSON.stringify({
          nome: "João Chaves",
          tipoPlantacao: "Cana-de-açúcar",
          cidade: "Recife",
          estado: "PE",
          tamanhoFazenda: "3"
      })
  });
  console.log("fetch OK");
} catch(e) {
  console.log(e.name, e.message);
}
