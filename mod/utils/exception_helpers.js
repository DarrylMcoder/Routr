/**
 * @author Pedro Sanders
 * @since v1
 */
module.exports.connectionException = (e, host, transaction) => {
  // WARNING: Placing this require outside the method causes error:
  // e: sendResponse is not a function
  const Response = Java.type('javax.sip.message.Response')
  const LogManager = Java.type('org.apache.logging.log4j.LogManager')
  const LOG = LogManager.getLogger()
  const { sendResponse } = require('@routr/core/processor/processor_utils')

  if (
    e instanceof Java.type('javax.sip.TransactionUnavailableException') ||
    e instanceof Java.type('java.net.ConnectException') ||
    e instanceof Java.type('java.net.NoRouteToHostException') ||
    e instanceof Java.type('java.net.UnknownHostException') ||
    e.toString().includes('IO Exception occured while Sending Request') ||
    e.toString().includes('Could not create a message channel for')
  ) {
    if (transaction) {
      sendResponse(transaction, Response.TEMPORARILY_UNAVAILABLE)
    }
    LOG.warn(
      `Unable to connect to host -> \`${host}\`.(Verify your network status)`
    )
  } else {
    if (transaction) {
      sendResponse(transaction, Response.SERVER_INTERNAL_ERROR)
    }
    LOG.error(e)
  }
}
