function getCookie(name) {
  var dc = document.cookie;
  var prefix = name + "=";
  var begin = dc.indexOf("; " + prefix);
  if (begin == -1) {
    begin = dc.indexOf(prefix);
    if (begin != 0) return null;
  } else {
    begin += 2;
    var end = document.cookie.indexOf(";", begin);
    if (end == -1) {
      end = dc.length;
    }
  }
  // because unescape has been deprecated, replaced with decodeURI
  //return unescape(dc.substring(begin + prefix.length, end));
  return decodeURI(dc.substring(begin + prefix.length, end));
}

async function sendIpToServer() {
  var res = await fetch(`https://api.ipify.org/?format=text`, {
    method: `GET`,
  });

  var ip = await res.text();

  var res2 = await fetch(`/e`, {
    method: `POST`,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      e_address: ip,
    }),
  });
}

if (getCookie("_IP_ADDRESS") == null) {
  sendIpToServer();
}
