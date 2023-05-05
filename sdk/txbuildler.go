package sdk

import (
	"encoding/hex"

	"github.com/gcash/bchd/bchec"
	"github.com/gcash/bchd/chaincfg/chainhash"
	"github.com/gcash/bchd/txscript"
	"github.com/gcash/bchd/wire"
	"github.com/gcash/bchutil"
)

const (
	dustAmt = 546
)

type msgTxBuilder struct {
	msgTx *wire.MsgTx
	err   error
}

func newMsgTxBuilder() *msgTxBuilder {
	return &msgTxBuilder{
		msgTx: wire.NewMsgTx(2),
	}
}

func (builder *msgTxBuilder) addInput(txid []byte, vout uint32) *msgTxBuilder {
	if builder.err != nil {
		return builder
	}

	// use NewHashFromStr() to byte-reverse txid !!!
	utxoHash, err := chainhash.NewHashFromStr(hex.EncodeToString(txid))
	if err != nil {
		builder.err = err
		return builder
	}

	outPoint := wire.NewOutPoint(utxoHash, vout)
	txIn := wire.NewTxIn(outPoint, nil)
	builder.msgTx.AddTxIn(txIn)
	return builder
}

func (builder *msgTxBuilder) addOutput(toAddr bchutil.Address, outAmt int64) *msgTxBuilder {
	if builder.err != nil {
		return builder
	}

	pkScript, err := txscript.PayToAddrScript(toAddr)
	if err != nil {
		builder.err = err
		return builder
	}

	txOut := wire.NewTxOut(outAmt, pkScript)
	builder.msgTx.AddTxOut(txOut)
	return builder
}

func (builder *msgTxBuilder) addChange(toAddr bchutil.Address, changeAmt int64) *msgTxBuilder {
	if changeAmt > dustAmt {
		return builder.addOutput(toAddr, changeAmt)
	}
	return builder
}

func (builder *msgTxBuilder) sign(
	inIdx int, inAmt int64,
	subScript []byte,
	privKey *bchec.PrivateKey,
	sigScriptFn func(sig []byte) ([]byte, error),
) *msgTxBuilder {

	if builder.err != nil {
		return builder
	}

	hashType := txscript.SigHashAll | txscript.SigHashForkID
	sig, err := txscript.RawTxInECDSASignature(builder.msgTx,
		inIdx, subScript, hashType, privKey, inAmt)
	if err != nil {
		builder.err = err
		return builder
	}

	sigScript, err := sigScriptFn(sig)
	if err != nil {
		builder.err = err
		return builder
	}

	builder.msgTx.TxIn[inIdx].SignatureScript = sigScript
	return builder
}

func (builder *msgTxBuilder) build() (*wire.MsgTx, error) {
	return builder.msgTx, builder.err
}
