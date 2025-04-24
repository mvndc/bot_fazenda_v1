const {
  Client, GatewayIntentBits, Partials, Routes, SlashCommandBuilder, REST, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Events
} = require('discord.js');
const { TOKEN, CLIENT_ID, GUILD_ID, ADMIN_ROLE , FINALIZED_CHANNEL_ID, CHANNEL_CAIXA, CHANNEL_SAIDAS } = require('./config');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

const products = {
  "------------ CAIXAS ------------": 0.0,
  "CAIXA DE ABÓBORA": 1.20,
  "CAIXA DE BOLDO": 1.20,
  "CAIXA DE CAFÉ": 1.20,
  "CAIXA DE CANA": 1.20,
  "CAIXA DE CENOURA": 1.20,
  "CAIXA DE GINSENG": 1.20,
  "CAIXA DE JUNCO": 1.20,
  "CAIXA DE MILHO": 1.20,
  "CAIXA DE TABACO": 1.20,
  "------------ POLPAS ------------": 0.0,
  "POLPA DE LARANJA": 1.20,
  "POLPA DE MARACUJÁ": 1.20,
  "------------ SACOS ------------": 0.0,
  "SACO DE AÇÚCAR": 1.20,
  "SACO DE ALGODÃO": 1.20,
  "SACO DE SAL": 2.40,
  "------------ EXTRAS ------------": 0.0,
  "ALGODÃO": 0.15,
  "FIBRA": 0.15,
  "CARNES": 0.30,
  "MOLHO DE PIMENTA": 2.40

};

let orders = new Map();

// Carregar encomendas do arquivo
function loadOrders() {
  try {
    const data = fs.readFileSync('./orders.json', 'utf8');
    orders = new Map(Object.entries(data ? JSON.parse(data) : {}));
  } catch (err) {
    console.error('Erro ao carregar encomendas:', err);
    orders = new Map();
    saveOrders(); 
  }
}

// Salvar encomendas no arquivo
function saveOrders() {
  try {
    const data = JSON.stringify(Object.fromEntries(orders), null, 2);
    fs.writeFileSync('./orders.json', data);
  } catch (err) {
    console.error('Erro ao salvar encomendas:', err);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  loadOrders();

  const commands = [
    new SlashCommandBuilder()
      .setName('encomenda')
      .setDescription('📦 Cria uma nova encomenda e permite adicionar produtos'),
      new SlashCommandBuilder()
      .setName('ping')
      .setDescription('🏓 Verifica a Latência do bot'),
      new SlashCommandBuilder()
      .setName('clear')
      .setDescription('🧹 Apaga uma quantidade de mensagens do canal.')
      .addIntegerOption(option =>
        option.setName('quantidade')
          .setDescription('Quantidade de mensagens a apagar (máximo 100)')
          .setRequired(true)
      ),     
      new SlashCommandBuilder()
      .setName('entrada')
      .setDescription('📥 Registrar uma entrada do caixa'),
      new SlashCommandBuilder()
      .setName('saida')
      .setDescription('📤Registrar uma saída do caixa')
  ];

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  
  try {
    console.log('🔄 Registrando comandos...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log('✅ Comandos registrados com sucesso');
  } catch (err) {
    console.error('Erro ao registrar comandos:', err);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ping') {
      const startTime = Date.now();  
      const reply = await interaction.reply({
        content: 'Pong!',
        withResponse: true 
      });
      const endTime = Date.now();  

      const ping = endTime - startTime;
      return interaction.editReply(`🏓Pong! Latência: ${ping}ms`);
    }
  }

  if (interaction.commandName === 'clear') {
    const quantidade = interaction.options.getInteger('quantidade');

    if (!interaction.member.roles.cache.has(ADMIN_ROLE)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.', flags: 64});
    }

    if (!interaction.member.permissions.has('ManageMessages')) {
      return interaction.reply({ content: '❌ Você não tem permissão para apagar mensagens.', flags: 64 });
    }

    if (quantidade < 1 || quantidade > 501) {
      return interaction.reply({ content: '❌ Insira um número entre 1 e 500.', flags: 64 });
    }

    try {
      const deleted = await interaction.channel.bulkDelete(quantidade, true);
      return interaction.reply({ content: `🧹 ${deleted.size} mensagens foram apagadas com sucesso.`, flags: 64 });
    } catch (err) {
      console.error('Erro ao apagar mensagens:', err);
      return interaction.reply({ content: '❌ Não foi possível apagar as mensagens. Talvez sejam antigas demais.', flags: 64 });
    }
  }
});



////ENCOMENDAS

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'encomenda') {
    const orderId = `${interaction.channel.id}-${interaction.user.id}-${Date.now()}`;
    orders.set(orderId, {
      id: orderId,
      cliente: '',
      postal: '',
      empresa: '',
      cidade: '',
      items: {},
      selected: null,
      userId: interaction.user.id
    });

    saveOrders();

    const embed = generateOrderEmbed(orderId, orders.get(orderId));
    await interaction.reply({
      embeds: [embed],
      components: [...buildProductSelectors(orderId), buildItemControls(orderId), buildClientForm(orderId)],
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('selecionar_produto')) {
    const orderId = interaction.customId.split('|')[1];
    const order = orders.get(orderId);
    if (!order) return;

    const selected = interaction.values[0];
    order.selected = selected;
    order.items[selected] = order.items[selected] || { quantidade: 1, produzido: 0 };

    saveOrders();

    const embed = generateOrderEmbed(orderId, order);
    await interaction.update({ embeds: [embed], components: [...buildProductSelectors(orderId), buildItemControls(orderId), buildClientForm(orderId)] });
  }

  if (interaction.isButton()) {
    const orderId = interaction.customId.split('|')[1];
    const customId = interaction.customId.split('|')[0];
    const order = orders.get(orderId);

    if (!order) return;

    if (customId === 'entrega_sim') {
      const message = await interaction.message.fetch();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('entrega_realizada').setLabel('✅ Entrega realizada').setStyle(ButtonStyle.Success).setDisabled(true)
      );
      await message.edit({ components: [row] });
      return interaction.reply({ content: '✅ Entrega marcada como realizada.',flags: 64 });
    }

    if (customId === 'entrega_nao') {
      return interaction.reply({ content: '❌ Entrega ainda não realizada.',flags: 64 });
    }

    if (customId === 'preencher_dados') {
      const modal = new ModalBuilder()
        .setCustomId(`formulario_cliente|${orderId}`)
        .setTitle('Preencher dados do cliente')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cliente').setLabel('Nome do Cliente').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('postal').setLabel('Postal').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('empresa').setLabel('Empresa').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cidade').setLabel('Cidade').setStyle(TextInputStyle.Short).setRequired(true))
        );
      return await interaction.showModal(modal);
    }

    if (!order.selected) return interaction.reply({ content: "Selecione um item primeiro.",flags: 64 });

    const item = order.selected;
    const data = order.items[item];

    if (customId === 'aumentar') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_quantidade|${orderId}`)
        .setTitle('Alterar Quantidade')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('nova_quantidade')
            .setLabel(`Nova quantidade para ${item}`)
            .setPlaceholder('Ex: 10')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ));
      return await interaction.showModal(modal);
    }

    if (customId === 'produzir') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_produzido|${orderId}`)
        .setTitle('Adicionar ao Produzido')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('novo_produzido')
            .setLabel(`Qtd para adicionar em ${order.selected}`)
            .setPlaceholder('Ex: 4')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ));
      return await interaction.showModal(modal);
    }

    if (customId === 'diminuir') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_diminuir|${orderId}`)
        .setTitle('Diminuir do Pedido')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('novo_diminuir')
            .setLabel(`Qtd para diminuir em ${order.selected}`)
            .setPlaceholder('Ex: 4')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ));
      return await interaction.showModal(modal);
    }

    if (customId === 'finalizar') {
      const embed = generateOrderEmbed(order.id, order);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`entrega_sim|${order.id}`).setLabel("✅ Efetuada").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`entrega_nao|${order.id}`).setLabel("❌ Não Efetuada").setStyle(ButtonStyle.Danger)
      );
      const targetChannel = await client.channels.fetch(FINALIZED_CHANNEL_ID);
      const sentMessage = await targetChannel.send({ embeds: [embed], components: [row] });    
      const deliveryMessage = sentMessage;
      try {
        await interaction.message.delete();
      } catch (error) {
        console.error('Erro ao excluir a mensagem original:', error);
      }   
      
      const filter = (i) => i.customId.startsWith('entrega_') && i.customId.endsWith(order.id);
      const collector = sentMessage.createMessageComponentCollector({ filter, time: 86400000 });
    
      collector.on('collect', async (i) => {
        const updatedEmbed = EmbedBuilder.from(embed);
        const components = [];
      
        if (i.customId === `entrega_sim|${order.id}`) {          
          let total = 0;
          for (const [produto, { quantidade }] of Object.entries(order.items)) {
            const preco = products[produto] || 0;
            total += preco * quantidade;
          }
      
          // Atualizar saldo do caixa
          caixa += total;
          saveCaixa();
          await atualizarCaixaChannel(client);
          
            const canalSaidas = client.channels.cache.get(CHANNEL_SAIDAS);
            const entradaEmbed = new EmbedBuilder()
              .setTitle('📥 Entrada de Caixa')
              .addFields(
                // { name: '📦 Encomenda', value: `ID ${order.id}` },
                { name: '💵 Valor', value: `R$ ${total.toFixed(2).replace('.', ',')}` },
                { name: '📝 Motivo', value: `Pagamento da encomenda de ${order.cliente || 'Cliente não identificado'}`},
                { name: '💰 Novo Saldo', value: `R$ ${caixa.toFixed(2).replace('.', ',')}` }
              )
              .setColor('Green')
              .setTimestamp();
            if (canalSaidas) canalSaidas.send({ embeds: [entradaEmbed] });      
          
          updatedEmbed.setColor('Green').setFooter({ text: 'Status: Entregue ✅' });
          await i.update({ embeds: [updatedEmbed], components });
      
        } else if (i.customId === `entrega_nao|${order.id}`) {
          updatedEmbed.setColor('Red').setFooter({ text: 'Status: Não Entregue ❌' });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`entrega_sim|${order.id}`)
              .setLabel('✅ Efetuada')
              .setStyle(ButtonStyle.Success)
          );
          await i.update({ embeds: [updatedEmbed], components: [row] });
        }
      });
      
      orders.delete(order.id);
      saveOrders();
      return interaction.reply({ content: "📦 Encomenda finalizada e enviada para o canal de entregas!",flags: 64 });
      }

    if (customId === 'atualizar') {
      const embed = generateOrderEmbed(order.id, order);
      return await interaction.update({ embeds: [embed], components: [...buildProductSelectors(orderId), buildItemControls(orderId), buildClientForm(orderId)] });
    }

    const embed = generateOrderEmbed(order.id, order);
    await interaction.update({ embeds: [embed], components: [...buildProductSelectors(orderId), buildItemControls(orderId), buildClientForm(orderId)] });
  }


///////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////MODAIS CAIXA////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////

  if (interaction.isModalSubmit()) {
    const [customId, orderId] = interaction.customId.split('|');
    const order = orders.get(orderId);
    
    // -- Formulário de cliente
    if (customId === 'formulario_cliente') {
      order.cliente = interaction.fields.getTextInputValue('cliente');
      order.postal = interaction.fields.getTextInputValue('postal');
      order.empresa = interaction.fields.getTextInputValue('empresa');
      order.cidade = interaction.fields.getTextInputValue('cidade');
      const embed = generateOrderEmbed(order.id, order);
      return await interaction.update({ embeds: [embed], components: [...buildProductSelectors(orderId), buildItemControls(orderId), buildClientForm(orderId)] });
    }
  
    // -- Quantidade
    if (customId === 'modal_quantidade') {
      const quantidade = parseInt(interaction.fields.getTextInputValue('nova_quantidade'));
      if (!isNaN(quantidade) && quantidade > 0) {
        const item = order.selected;
        order.items[item].quantidade = quantidade;
        order.items[item].produzido = Math.min(order.items[item].produzido, quantidade);
        const embed = generateOrderEmbed(order.id, order);
        return await interaction.update({ embeds: [embed], components: [...buildProductSelectors(orderId), buildItemControls(orderId), buildClientForm(orderId)] });
      }
    }
  
    // -- Produzido
    if (customId === 'modal_produzido') {
      const produzido = parseInt(interaction.fields.getTextInputValue('novo_produzido'));
      if (!isNaN(produzido) && produzido >= 0) {
        const item = order.selected;
        const max = order.items[item].quantidade;
        order.items[item].produzido = Math.min(order.items[item].produzido + produzido, max);
        const embed = generateOrderEmbed(order.id, order);
        return await interaction.update({ embeds: [embed], components: [...buildProductSelectors(orderId), buildItemControls(orderId), buildClientForm(orderId)] });
      }
    }
  
    // -- Diminuir
    if (customId === 'modal_diminuir') {
      const quantidade = parseInt(interaction.fields.getTextInputValue('novo_diminuir'));
      if (!isNaN(quantidade) && quantidade > 0) {
        const item = order.selected;
        const data = order.items[item];
        if (data.quantidade - quantidade >= 0) {
          data.quantidade -= quantidade;
          data.produzido = Math.min(data.produzido, data.quantidade);
          if (data.quantidade === 0) {
            delete order.items[item];
          }
        } else {
          return interaction.deferUpdate();
        }
      } else {
        return interaction.deferUpdate();
      }
    }
  
    // -- Entrada e Saída de Caixa
    if (customId === 'modal_entrada' || customId === 'modal_saida') {
      const valorStr = interaction.fields.getTextInputValue('valor').replace(',', '.');
      const motivo = interaction.fields.getTextInputValue('motivo');
      const valor = parseFloat(valorStr);
  
      if (isNaN(valor) || valor <= 0) {
        return interaction.reply({ content: '❌ Valor inválido.', flags: 64 });
      }
  
      const canalSaidas = client.channels.cache.get(CHANNEL_SAIDAS);
      let embed;
  
      if (customId === 'modal_entrada') {
        caixa += valor;
        embed = new EmbedBuilder()
          .setTitle('📥 Entrada de Caixa')
          .addFields(
            { name: '💵 Valor', value: `R$ ${valor.toFixed(2).replace('.', ',')}` },
            { name: '📝 Motivo', value: motivo },
            { name: '💰 Novo Saldo', value: `R$ ${caixa.toFixed(2).replace('.', ',')}` }
          )
          .setColor('Green')
          .setTimestamp();
  
        if (canalSaidas) canalSaidas.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Entrada registrada com sucesso.', flags: 64 });
      }
  
      if (customId === 'modal_saida') {
        if (valor > caixa) {
          return interaction.reply({ content: '❌ Valor maior que o saldo atual.', flags: 64 });
        }
  
        caixa -= valor;
        embed = new EmbedBuilder()
          .setTitle('📤 Saída de Caixa')
          .addFields(
            { name: '💵 Valor', value: `R$ ${valor.toFixed(2).replace('.', ',')}` },
            { name: '📝 Motivo', value: motivo },
            { name: '💰 Novo Saldo', value: `R$ ${caixa.toFixed(2).replace('.', ',')}` }
          )
          .setColor('Red')
          .setTimestamp();
  
        if (canalSaidas) canalSaidas.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Saída registrada com sucesso.', flags: 64 });
      }
  
      saveCaixa();
      await atualizarCaixaChannel(client);
      return;
    }
  
    saveOrders();
    const embed = generateOrderEmbed(order.id, order);
    return await interaction.update({ embeds: [embed], components: [...buildProductSelectors(orderId), buildItemControls(orderId), buildClientForm(orderId)] });
  }
  
});

// Helpers
function generateOrderEmbed(id, order) {
  const total = Object.entries(order.items).reduce((sum, [item, data]) => {
    return sum + (products[item] * data.quantidade);
  }, 0).toFixed(2);

  const itemLines = Object.entries(order.items)
    .map(([item, data]) => `• ${data.quantidade}x ${item} ($${products[item].toFixed(2)}) - ${data.produzido}/${data.quantidade} ✅`)
    .join("\n");

  return new EmbedBuilder()
    .setTitle(`🔔 NOVA ENCOMENDA - ${new Date().toLocaleDateString("pt-BR")}`)
    .setColor("Green")
    .addFields(
      { name: "📄 Informações do Cliente", value: `**Cliente:** ${order.cliente || "-"}\n**Postal:** ${order.postal || "-"}\n**Empresa:** ${order.empresa || "-"}\n**Cidade:** ${order.cidade || "-"}` },
      { name: "📦 Pedido", value: itemLines || "Nenhum item adicionado." },
      { name: "💰 VALOR TOTAL", value: `$${total}` },
      // { name: '📦 ID da encomenda', value: `ID ${order.id}` },
    );
}

function buildProductSelectors(orderId) {
  const keys = Object.keys(products);
  const menus = [];

  for (let i = 0; i < keys.length; i += 25) {
    menus.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`selecionar_produto|${orderId}`)
          .setPlaceholder("Selecione um produto")
          .addOptions(keys.slice(i, i + 25).map(prod => ({ label: prod, value: prod })))
      )
    );
  }

  return menus;
}

function buildItemControls(orderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`aumentar|${orderId}`).setLabel("➕ Quantidade").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`diminuir|${orderId}`).setLabel("➖ Quantidade").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`produzir|${orderId}`).setLabel("✅ Produzido").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`atualizar|${orderId}`).setLabel("🔄 Atualizar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`finalizar|${orderId}`).setLabel("📦 Finalizar").setStyle(ButtonStyle.Danger)
  );
}

function buildClientForm(orderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`preencher_dados|${orderId}`).setLabel("📝 Preencher Dados").setStyle(ButtonStyle.Primary)
  );
}


///////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////CONTROLE CAIXA////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////
let caixa = 0;

function loadCaixa() {
  try {
    const data = fs.readFileSync('./caixa.json', 'utf8');
    caixa = JSON.parse(data).saldo || 0;
  } catch (err) {
    console.error('Erro ao carregar o caixa:', err);
    caixa = 0;
    saveCaixa();
  }
}

function saveCaixa() {
  try {
    fs.writeFileSync('./caixa.json', JSON.stringify({ saldo: caixa }, null, 2));
  } catch (err) {
    console.error('Erro ao salvar o caixa:', err);
  }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////

async function atualizarCaixaChannel(client) {
  try {
    const canal = await client.channels.fetch(CHANNEL_CAIXA);
    if (canal) {
      const mensagens = await canal.messages.fetch({ limit: 10 });
      const msg = mensagens.find(m => m.author.id === client.user.id);

      const embed = new EmbedBuilder()
      .setTitle('💼 Caixa Atual')
      .setDescription(`O saldo atual do caixa é:\n\n**R$ ${caixa.toFixed(2).replace('.', ',')}**`)
      .setColor('Gold')
      .setFooter({ text: 'Atualizado automaticamente com as movimentações registradas' })
      .setTimestamp();        

      if (msg) await msg.edit({ embeds: [embed] });
      else await canal.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('Erro ao atualizar canal de caixa:', err);
  }
}

client.on(Events.ClientReady, () => {
  loadCaixa();
  atualizarCaixaChannel(client);
});

///////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////MODAIS CAIXA////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'entrada') {
      const modal = new ModalBuilder()
        .setCustomId('modal_entrada')
        .setTitle('Registrar Entrada do Caixa');

      const valorInput = new TextInputBuilder()
        .setCustomId('valor')
        .setLabel('Valor da Entrada')
        .setPlaceholder('Valor da entrada')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo')
        .setLabel('Motivo da Entrada')
        .setPlaceholder('Descreva o motivo da entrada.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(valorInput);
      const row2 = new ActionRowBuilder().addComponents(motivoInput);
      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
    }

    if (interaction.commandName === 'saida') {
      const modal = new ModalBuilder()
        .setCustomId('modal_saida')
        .setTitle('Registrar Saída do Caixa');

      const valorInput = new TextInputBuilder()
        .setCustomId('valor')
        .setLabel('Valor da Saída')
        .setPlaceholder('Valor da saída')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo')
        .setLabel('Motivo da Saída')
        .setPlaceholder('Descreva o motivo da saída.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(valorInput);
      const row2 = new ActionRowBuilder().addComponents(motivoInput);
      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
    }
  }


});

client.login(TOKEN);
