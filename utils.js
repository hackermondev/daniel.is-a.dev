const Client = require("@replit/database");
const client = new Client();

async function addLog(route, ip, userAgent) {
  var currentLogs = await client.get(`website_logs`);

  if (!currentLogs) {
    currentLogs = [];
  }

  if(ip == process.env.MY_IP){
    return
  }

  currentLogs.push({
    route,
    ip,
    userAgent,
  });

  await client.set(`website_logs`, currentLogs);
}

async function getLogs() {
  var currentLogs = await client.get(`website_logs`);

  if (!currentLogs) {
    currentLogs = [];
  }

  if(currentLogs.length > 500){
    currentLogs = currentLogs.slice(0, 500)
  }

  return currentLogs;
}

module.exports = {
  addLog,
  getLogs,
};
