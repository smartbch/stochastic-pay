package sdk

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"fmt"

	"github.com/ethereum/go-ethereum/common"
	"github.com/gcash/bchd/bchec"
	"github.com/gcash/bchd/chaincfg"
	"github.com/gcash/bchd/txscript"
	"github.com/gcash/bchd/wire"
	"github.com/gcash/bchutil"
)

const (
	RedeemScriptWithoutConstructorArgsHex = "0x5579009c635779a97b88557a567aad557aa87b886d6d5167557a519d5679a988717cad7bb275527900a06300c653799502102796c3519d00cc78a26900cd0376a91453797e0288ac7e8875686d755168"
)

var (
	redeemScriptWithoutConstructorArgs = common.FromHex(RedeemScriptWithoutConstructorArgsHex)
)

type SpayCovenant struct {
	senderPkh    [20]byte // 20 bytes
	recipientPkh [20]byte // 20 bytes
	hash         [32]byte // 32 bytes, provided by the recipient
	salt         [4]byte  // 4 bytes, provided by the sender
	expiration   int64
	probability  int64
	net          *chaincfg.Params
}

func NewMainnetCovenant(
	senderPkh, recipientPkh [20]byte, hash [32]byte, salt [4]byte, expiration, probability int64,
) (*SpayCovenant, error) {

	return NewCovenant(senderPkh, recipientPkh, hash, salt, expiration, probability, &chaincfg.MainNetParams)
}

func NewCovenant(
	senderPkh, recipientPkh [20]byte, hash [32]byte, salt [4]byte, expiration, probability int64,
	net *chaincfg.Params,
) (*SpayCovenant, error) {

	return &SpayCovenant{
		senderPkh:    senderPkh,
		recipientPkh: recipientPkh,
		hash:         hash,
		salt:         salt,
		expiration:   expiration,
		probability:  probability,
		net:          net,
	}, nil
}

func (c *SpayCovenant) String() string {
	return fmt.Sprintf(
		`
SpayCovenant:
	senderPkh:%s
	recipientPkh:%s
	hash:%s
	salt:%s
	expiration:%d
	probability:%d
`,
		hex.EncodeToString(c.senderPkh[:]),
		hex.EncodeToString(c.recipientPkh[:]),
		hex.EncodeToString(c.hash[:]),
		hex.EncodeToString(c.salt[:]),
		c.expiration,
		c.probability)
}

func (c *SpayCovenant) GetRedeemScriptHash() ([]byte, error) {
	redeemScript, err := c.BuildFullRedeemScript()
	if err != nil {
		return nil, err
	}
	return bchutil.Hash160(redeemScript), nil
}

func (c *SpayCovenant) GetP2SHAddress() (string, error) {
	redeemScript, err := c.BuildFullRedeemScript()
	if err != nil {
		return "", err
	}

	redeemHash := bchutil.Hash160(redeemScript)
	addr, err := bchutil.NewAddressScriptHashFromHash(redeemHash, c.net)
	if err != nil {
		return "", err
	}

	return c.net.CashAddressPrefix + ":" + addr.EncodeAddress(), nil
}

func (c *SpayCovenant) MakeReceiveTx(
	txid []byte, vout uint32, inAmt int64,  // input info
	toAddr bchutil.Address, minerFee int64, // output info
	secret []byte,
	privKey *bchec.PrivateKey,
) (*wire.MsgTx, error) {
	return c.makeReceiveOrRefundTx(txid, vout, inAmt, toAddr, minerFee, secret, privKey)
}

func (c *SpayCovenant) MakeRefundTx(
	txid []byte, vout uint32, inAmt int64,  // input info
	toAddr bchutil.Address, minerFee int64, // output info
	privKey *bchec.PrivateKey,
) (*wire.MsgTx, error) {
	return c.makeReceiveOrRefundTx(txid, vout, inAmt, toAddr, minerFee, nil, privKey)
}

func (c *SpayCovenant) makeReceiveOrRefundTx(
	txid []byte, vout uint32, inAmt int64,  // input info
	toAddr bchutil.Address, minerFee int64, // output info
	secret []byte,
	privKey *bchec.PrivateKey,
) (*wire.MsgTx, error) {

	pbk := privKey.PubKey().SerializeCompressed()
	pkh := bchutil.Hash160(pbk)
	if !bytes.Equal(pkh, c.recipientPkh[:]) && !bytes.Equal(pkh, c.senderPkh[:]) {
		return nil, fmt.Errorf("not match the sender pubkey hash or recipient pubkey hash")
	}
	if bytes.Equal(pkh, c.recipientPkh[:]) && len(secret) != 32 {
		return nil, fmt.Errorf("secret is not 32 bytes")
	}

	redeemScript, err := c.BuildFullRedeemScript()
	if err != nil {
		return nil, err
	}

	sigScriptFn := func(sig []byte) ([]byte, error) {
		if bytes.Equal(pkh, c.recipientPkh[:]) {
			return c.BuildReceiveSigScript(sig, pbk, secret)
		}
		return c.BuildRefundSigScript(sig, pbk)
	}

	return newMsgTxBuilder().
		addInput(txid, vout).
		addOutput(toAddr, inAmt-minerFee).
		sign(0, inAmt, redeemScript, privKey, sigScriptFn).
		build()
}

func (c *SpayCovenant) MakeSPAYTx(
	fromKey *bchec.PrivateKey,
	txid []byte, vout uint32, inAmt int64, // input info
	outAmt int64,                          // output info
	minerFee int64,
) (*wire.MsgTx, error) {
	fromPk := fromKey.PubKey().SerializeCompressed()
	fromPkh := bchutil.Hash160(fromPk)
	changeAmt := inAmt - outAmt - minerFee
	if changeAmt < 0 {
		return nil, fmt.Errorf("insufficient input value: %d < %d", inAmt, outAmt+minerFee)
	}

	script, err := c.BuildFullRedeemScript()
	if err != nil {
		return nil, fmt.Errorf("failed to build full redeem script: %d", err)
	}

	toAddr, err := bchutil.NewAddressScriptHash(script, c.net)
	if err != nil {
		return nil, fmt.Errorf("failed to calc p2sh address: %d", err)
	}

	changeAddr, err := bchutil.NewAddressPubKeyHash(fromPkh, c.net)
	if err != nil {
		return nil, fmt.Errorf("failed to calc p2pkh address: %w", err)
	}

	prevPkScript, err := payToPubKeyHashPkScript(fromPkh)
	if err != nil {
		return nil, fmt.Errorf("failed to creatte pkScript: %w", err)
	}

	sigScriptFn := func(sig []byte) ([]byte, error) {
		return payToPubKeyHashSigScript(sig, fromPk)
	}

	return newMsgTxBuilder().
		addInput(txid, vout).
		addOutput(toAddr, outAmt).
		addChange(changeAddr, changeAmt).
		sign(0, inAmt, prevPkScript, fromKey, sigScriptFn).
		build()
}

func (c *SpayCovenant) BuildFullRedeemScript() ([]byte, error) {
	return txscript.NewScriptBuilder().
		AddInt64(c.probability).
		AddInt64(c.expiration).
		AddData(c.salt[:]).
		AddData(c.hash[:]).
		AddData(c.recipientPkh[:]).
		AddData(c.senderPkh[:]).
		AddOps(redeemScriptWithoutConstructorArgs).
		Script()
}

func (c *SpayCovenant) BuildReceiveSigScript(recipientSig, recipientPk, secret []byte) ([]byte, error) {
	redeemScript, err := c.BuildFullRedeemScript()
	if err != nil {
		return nil, err
	}

	return txscript.NewScriptBuilder().
		AddData(secret).
		AddData(recipientPk).
		AddData(recipientSig).
		AddInt64(0). // selector
		AddData(redeemScript).
		Script()
}

func (c *SpayCovenant) BuildRefundSigScript(senderSig, senderPk []byte) ([]byte, error) {
	redeemScript, err := c.BuildFullRedeemScript()
	if err != nil {
		return nil, err
	}

	return txscript.NewScriptBuilder().
		AddData(senderPk).
		AddData(senderSig).
		AddInt64(1). // selector
		AddData(redeemScript).
		Script()
}

func payToPubKeyHashSigScript(sig, pk []byte) ([]byte, error) {
	return txscript.NewScriptBuilder().AddData(sig).AddData(pk).Script()
}

func payToPubKeyHashPkScript(pubKeyHash []byte) ([]byte, error) {
	return txscript.NewScriptBuilder().
		AddOp(txscript.OP_DUP).
		AddOp(txscript.OP_HASH160).
		AddData(pubKeyHash).
		AddOp(txscript.OP_EQUALVERIFY).
		AddOp(txscript.OP_CHECKSIG).
		Script()
}

func GetProbabilityRatio(prob int64) float64 {
	return float64(prob) / float64(1<<64)
}

func GetProbabilityByRatio(prob float64) int64 {
	return int64(prob * (1 << 64))
}

func CheckIfProbabilityHit(secret [32]byte, salt [4]byte, probability int64) bool {
	hash := bchutil.Hash160(append(salt[:], secret[:]...))
	return int64(binary.BigEndian.Uint64(hash[12:])) < probability
}
