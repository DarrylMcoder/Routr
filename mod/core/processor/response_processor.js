/**
 * @author Pedro Sanders
 * @since v1
 */
const DSSelector = require('@routr/data_api/ds_selector')
const GatewaysAPI = require('@routr/data_api/gateways_api')
const {
  isStackJob,
  isTransactional,
  mustAuthenticate,
  handleAuthChallenge,
  hasSDP,
  extractRTPEngineParams,
  isOk
} = require('@routr/core/processor/processor_utils')
const RTPEngineConnector = require('@routr/rtpengine/connector')
const ViaHeader = Java.type('javax.sip.header.ViaHeader')
const ContentTypeHeader = Java.type('javax.sip.header.ContentTypeHeader')
const SipFactory = Java.type('javax.sip.SipFactory')
const LogManager = Java.type('org.apache.logging.log4j.LogManager')
const LOG = LogManager.getLogger()
const headerFactory = SipFactory.getInstance().createHeaderFactory()

class ResponseProcessor {
  constructor (sipProvider, contextStorage) {
    this.sipProvider = sipProvider
    this.contextStorage = contextStorage
    this.gatewaysAPI = new GatewaysAPI(DSSelector.getDS())
  }

  process (event) {
    if (isStackJob(event.getResponse())) {
      return
    }
    // If it is not transactional and authentication is required it means
    // that the REGISTER request was originated by another sipStack
    if (mustAuthenticate(event.getResponse()) && isTransactional(event)) {
      const gwRef = event
        .getClientTransaction()
        .getRequest()
        .getHeader('X-Gateway-Ref').value
      const r = this.gatewaysAPI.getGateway(gwRef)
      handleAuthChallenge(this.sipProvider.getSipStack(), event, r.data)
      return
    }
    this.sendResponse(event)
  }

  async sendResponse (event) {
    const response = event.getResponse().clone()
    const viaHeader = response.getHeader(ViaHeader.NAME)
    const xReceivedHeader = headerFactory.createHeader(
      'X-Inf-Received',
      viaHeader.getReceived()
    )
    const xRPortHeader = headerFactory.createHeader(
      'X-Inf-RPort',
      `${viaHeader.getRPort()}`
    )
    response.addHeader(xReceivedHeader)
    response.addHeader(xRPortHeader)
    response.removeFirst(ViaHeader.NAME)

    try {
      if (isTransactional(event)) {
        const context = this.contextStorage.findContext(
          event.getClientTransaction().getBranchId()
        )

        // WARNING: Hardcode
        if (isOk(response) && hasSDP(response)) {
          const obj = await RTPEngineConnector.answer(
            'WEB_TO_SIP',
            extractRTPEngineParams(response)
          )
          // WARNINIG: We are not getting rtcp-mux so we endup adding here
          // This is probably part of the issue we are having with calls on Zoiper
          response.setContent(
            obj.sdp.replace('a=sendrecv', 'a=sendrecv\r\na=rtcp-mux'),
            response.getHeader(ContentTypeHeader.NAME)
          )
        }

        if (context && context.serverTransaction) {
          context.serverTransaction.sendResponse(response)
        } else if (response.getHeader(ViaHeader.NAME) !== null) {
          this.sipProvider.sendResponse(response)
        }
      } else if (response.getHeader(ViaHeader.NAME) !== null) {
        // Could be a BYE due to Record-Route
        this.sipProvider.sendResponse(response)
      }
    } catch (e) {
      LOG.error(e)
    }
    LOG.debug(response)
  }
}

module.exports = ResponseProcessor
