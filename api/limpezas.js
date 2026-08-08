    if (req.method === 'POST') {
    try {
      const { id, estado } = req.body;
      
      if (estado === 'reset') {
        await redis.set('estados_limpezas', {});
        return res.status(200).json({ success: true, estados: {} });
      }

      if (!id) return res.status(400).json({ error: 'ID em falta' });

      let estados = (await redis.get('estados_limpezas')) || {};
      
      if (estado === 'pendente') {
        delete estados[id];
      } else {
        estados[id] = estado;
      }

      await redis.set('estados_limpezas', estados);
      return res.status(200).json({ success: true, estados });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }
