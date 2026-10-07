// Test-only transport guard, inherited by Next's Node children via NODE_OPTIONS.
const fs = require('node:fs');
const net = require('node:net');
const dgram = require('node:dgram');
const audit = process.env.CB02_OUTBOUND_AUDIT;
if (!audit) throw new Error('Missing CB-02 outbound audit');
function deny() {
  // Never record URLs, headers, payloads, credentials, or transcripts.
  fs.appendFileSync(audit, 'denied node\n');
  throw new Error('CB-02 outbound connection blocked');
}
function local(host) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(host);
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // net.connect and tls.connect can pass Node's normalized argument array.
  const values = Array.isArray(args[0]) ? args[0] : args;
  const options = typeof values[0] === 'object' ? { ...values[0] } : {
    port: values[0], host: typeof values[1] === 'string' ? values[1] : undefined,
  };
  // Unix-domain sockets are local IPC, not network egress. Next and native
  // integrations may use them on Linux, so preserve those connections.
  if (options.path) return connect.apply(this, args);
  if (!options.port) return deny();
  // Resolve the approved name ourselves; do not trust DNS or a custom lookup.
  if (!options.host || options.host === 'localhost') options.host = '127.0.0.1';
  if (!local(options.host)) return deny();
  options.lookup = (_name, _options, callback) => callback(new Error('CB-02 DNS disabled'));
  return connect.call(this, options, ...values.slice(1).filter(value => typeof value === 'function'));
};
// Neither server needs UDP. Blocking it also closes direct DNS/datagram egress.
dgram.Socket.prototype.send = deny;
dgram.Socket.prototype.connect = deny;
