import { FHESwap, FHESwap__factory, ConfidentialFungibleTokenMintableBurnable, ConfidentialFungibleTokenMintableBurnable__factory } from "../types";            
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import hre from "hardhat";
import { ethers as ethersjs } from "ethers";

/**
 * @dev 定义测试中使用的签名者类型。
 * deployer: 部署合约的账户，通常是测试中的“owner”或“admin”。
 * alice: 模拟普通用户交互的账户。
 * bob: 另一个模拟普通用户交互的账户。
 */
type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

/**
 * @dev 辅助函数，用于部署 ConfidentialFungibleTokenMintableBurnable 和 FHESwap 合约。
 * @param deployerAddress 合约的部署者地址，同时也是 token 合约和 FHESwap 合约的 owner。
 * @returns 包含已部署 token 合约实例、地址以及 FHESwap 合约实例和地址的对象。
 */
async function deployTokenAndSwapFixture(deployerAddress: string) {
  console.log("\n--- 部署合约 ---");
  // 获取 ConfidentialFungibleTokenMintableBurnable 合约工厂
  const tokenFactory = (await ethers.getContractFactory("ConfidentialFungibleTokenMintableBurnable")) as ConfidentialFungibleTokenMintableBurnable__factory;
  // 部署 TokenA，名称 "TokenA"，符号 "TKA"
  const tokenA = (await tokenFactory.deploy(deployerAddress, "TokenA", "TKA", "https://example.com/metadataA")) as ConfidentialFungibleTokenMintableBurnable;
  // 部署 TokenB，名称 "TokenB"，符号 "TKB"
  const tokenB = (await tokenFactory.deploy(deployerAddress, "TokenB", "TKB", "https://example.com/metadataB")) as ConfidentialFungibleTokenMintableBurnable;

  // 获取已部署 TokenA 和 TokenB 合约地址
  const tokenAAddress = await tokenA.getAddress();
  const tokenBAddress = await tokenB.getAddress();
  console.log(`TokenA 部署于: ${tokenAAddress}`);
  console.log(`TokenB 部署于: ${tokenBAddress}`);

  // 获取 FHESwapUser 合约工厂
  const swapFactory = await ethers.getContractFactory("FHESwapUser");
  // 部署 FHESwapUser 合约，传入 TokenA 和 TokenB 地址，以及 deployer 地址作为 owner
  const fHeSwap = await swapFactory.deploy(tokenAAddress, tokenBAddress, deployerAddress);
  // 获取已部署 FHESwap 合约地址
  const fHeSwapAddress = await fHeSwap.getAddress();
  console.log(`FHESwap 部署于: ${fHeSwapAddress}`);
  console.log("--- 合约部署完成 ---\n");

  // 返回所有已部署合约实例和地址
  return { tokenA, tokenB, tokenAAddress, tokenBAddress, fHeSwap, fHeSwapAddress };
}

/**
 * @dev FHESwapUser 合约的测试套件。
 * 包括部署、流动性提供和代币交换的测试。
 */
describe("FHESwapUser", function () {
  // 定义测试中使用的签名者和合约实例变量
  let signers: Signers;
  let tokenA: ConfidentialFungibleTokenMintableBurnable;
  let tokenB: ConfidentialFungibleTokenMintableBurnable;
  let tokenAAddress: string;
  let tokenBAddress: string;
  let fHeSwap: any;
  let fHeSwapAddress: string;
  let initialReserveAmountA: bigint;
  let initialReserveAmountB: bigint;

  // 在所有测试用例之前执行一次的钩子函数
  before(async function () {
    console.log("--- 测试初始化 ---");
    // 初始化 FHEVM CLI API，这是与 FHEVM 交互所需
    await fhevm.initializeCLIApi();
    // 获取 Hardhat 提供的 Ethereum 签名者（账户）
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    // 将签名者分配给命名变量以供后续使用
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
    console.log(`Deployer 地址: ${signers.deployer.address}`);
    console.log(`Alice 地址: ${signers.alice.address}`);
    console.log(`Bob 地址: ${signers.bob.address}`);

    // 调用辅助函数部署所有合约，并解构赋值到相应变量
    ({ tokenA, tokenB, tokenAAddress, tokenBAddress, fHeSwap, fHeSwapAddress } = await deployTokenAndSwapFixture(await signers.deployer.getAddress()));

    // 断言 FHEVM 协处理器已初始化。这是确保 FHE 操作正常工作的关键。
    await hre.fhevm.assertCoprocessorInitialized(tokenA, "ConfidentialFungibleTokenMintableBurnable");
    await hre.fhevm.assertCoprocessorInitialized(tokenB, "ConfidentialFungibleTokenMintableBurnable");
    await hre.fhevm.assertCoprocessorInitialized(fHeSwap, "FHESwapUser");
    console.log("--- FHEVM 协处理器初始化完成 ---\n");
  });

  /**
   * @dev 测试 FHESwapUser 合约是否成功部署，并检查其初始状态（如 token0、token1、owner 地址）。
   */
  it("should deploy FHESwapUser successfully and set correct token addresses", async function () {
    console.log("--- 测试: 部署 FHESwapUser 并设置正确地址 ---");

    // 验证 FHESwapUser 合约中记录的 token0 地址是否匹配实际部署的 TokenA 地址
    expect(await fHeSwap.token0()).to.equal(tokenAAddress);
    console.log(`FHESwap.token0: ${await fHeSwap.token0()} (预期: ${tokenAAddress})`);

    // 验证 FHESwapUser 合约中记录的 token1 地址是否匹配实际部署的 TokenB 地址
    expect(await fHeSwap.token1()).to.equal(tokenBAddress);
    console.log(`FHESwap.token1: ${await fHeSwap.token1()} (预期: ${tokenBAddress})`);
    
    // 验证 FHESwapUser 合约的 owner 是 deployer
    expect(await fHeSwap.owner()).to.equal(signers.deployer.address);
    console.log(`FHESwap.owner: ${await fHeSwap.owner()} (预期: ${signers.deployer.address})`);
    console.log("--- 部署测试通过 ---\n");
  });

  /**
   * @dev 测试 owner (deployer) 是否可以成功向 FHESwapUser 合约铸造初始流动性。
   * 这包括向自己铸造代币、授权 FHESwapUser 合约作为操作员，然后调用 FHESwapUser 的 mint 函数。
   * 最后，验证 FHESwapUser 合约内部的加密储备是否正确更新。
   */
  it("should allow owner to mint initial liquidity", async function () {
    console.log("--- 测试: Owner 铸造初始流动性 ---");
    const owner = signers.deployer; // 定义 owner 为 deployer 账户
    initialReserveAmountA = ethersjs.parseUnits("1000", 6); // 初始流动性金额
    initialReserveAmountB = ethersjs.parseUnits("300", 6); // 初始流动性金额
    console.log(`初始储备金额 TokenA: ${ethersjs.formatUnits(initialReserveAmountA, 6)}, TokenB: ${ethersjs.formatUnits(initialReserveAmountB, 6)}`);

    // 1. Owner 首先向自己铸造 TokenA 和 TokenB（用于提供流动性）
    console.log("1. Owner 向自己铸造代币:");
    // 创建加密输入，目标合约是 TokenA，发起人是 owner，值为 initialReserveAmount (euint64 类型)
    const encryptedMintA = await fhevm.createEncryptedInput(tokenAAddress, owner.address).add64(initialReserveAmountA).encrypt();
    console.log(`创建加密输入 (TokenA): Handle=${ethersjs.hexlify(encryptedMintA.handles[0])}, Proof=${ethersjs.hexlify(encryptedMintA.inputProof)}`);
    // Owner 调用 TokenA 合约的 mint 函数，向自己铸造加密 TokenA
    await tokenA.connect(owner).mint(owner.address, encryptedMintA.handles[0], encryptedMintA.inputProof);
    console.log(`Owner 向自己铸造 ${ethersjs.formatUnits(initialReserveAmountA, 6)} TokenA。`);

    // 获取 owner 在 TokenA 中的加密余额句柄
    const ownerTokenAEncryptedBalance = await tokenA.confidentialBalanceOf(owner.address);
    console.log(`Owner 在 TokenA 中的加密余额句柄: ${ethersjs.hexlify(ownerTokenAEncryptedBalance)}`);
    // 授权 TokenA 合约操作 owner 的加密 TokenA 余额
    await tokenA.connect(owner).authorizeSelf(ownerTokenAEncryptedBalance);
    console.log(`Owner 授权 TokenA 合约操作他们的加密 TokenA 余额 (句柄: ${ethersjs.hexlify(ownerTokenAEncryptedBalance)}, 授权至: ${tokenAAddress})。`);

    // 解密 owner 在 TokenA 中的余额以用于诊断打印
    const decryptedOwnerTokenA = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(ownerTokenAEncryptedBalance),
      tokenAAddress,
      owner
    );
    console.log(`诊断: Owner 的 TokenA 余额 (解密): ${ethersjs.formatUnits(decryptedOwnerTokenA, 6)}`);

    // 创建加密输入，目标合约是 TokenB，发起人是 owner，值为 initialReserveAmount (euint64 类型)
    const encryptedMintB = await fhevm.createEncryptedInput(tokenBAddress, owner.address).add64(initialReserveAmountB).encrypt();
    console.log(`创建加密输入 (TokenB): Handle=${ethersjs.hexlify(encryptedMintB.handles[0])}, Proof=${ethersjs.hexlify(encryptedMintB.inputProof)}`);
    // Owner 调用 TokenB 合约的 mint 函数，向自己铸造加密 TokenB
    await tokenB.connect(owner).mint(owner.address, encryptedMintB.handles[0], encryptedMintB.inputProof);
    console.log(`Owner 向自己铸造 ${ethersjs.formatUnits(initialReserveAmountB, 6)} TokenB。`);

    // 获取 owner 在 TokenB 中的加密余额句柄
    const ownerTokenBEncryptedBalance = await tokenB.confidentialBalanceOf(owner.address);
    console.log(`Owner 在 TokenB 中的加密余额句柄: ${ethersjs.hexlify(ownerTokenBEncryptedBalance)}`);
    // 授权 TokenB 合约操作 owner 的加密 TokenB 余额
    await tokenB.connect(owner).authorizeSelf(ownerTokenBEncryptedBalance);
    console.log(`Owner 授权 TokenB 合约操作他们的加密 TokenB 余额 (句柄: ${ethersjs.hexlify(ownerTokenBEncryptedBalance)}, 授权至: ${tokenBAddress})。`);

    // 2. Owner 授权 FHESwapUser 合约作为 TokenA 和 TokenB 的操作员
    console.log("2. Owner 批准 FHESwapUser 作为 TokenA 和 TokenB 的操作员:");
    // operatorExpiry 定义操作员授权的过期时间 (当前时间 + 1 小时)
    const operatorExpiry = Math.floor(Date.now() / 1000) + 3600;
    // Owner 调用 TokenA 合约的 setOperator 授权 FHESwapUser 合约操作 owner 的 TokenA
    await tokenA.connect(owner).setOperator(fHeSwapAddress, operatorExpiry);
    console.log(`Owner 授权 FHESwapUser 作为 TokenA 操作员 (FHESwapUser 地址: ${fHeSwapAddress}, 过期: ${operatorExpiry})。`);
    // Owner 调用 TokenB 合约的 setOperator 授权 FHESwapUser 合约操作 owner 的 TokenB
    await tokenB.connect(owner).setOperator(fHeSwapAddress, operatorExpiry);
    console.log(`Owner 授权 FHESwapUser 作为 TokenB 操作员 (FHESwapUser 地址: ${fHeSwapAddress}, 过期: ${operatorExpiry})。`);

    // 3. Owner 向 FHESwapUser 合约提供流动性
    console.log("3. Owner 向 FHESwapUser 提供流动性:");
    // 创建加密输入，目标合约是 FHESwapUser，发起人是 owner，值为 initialReserveAmount (euint64 类型)
    // 注意: 此处的目标合约必须是 fHeSwapAddress，因为这些加密输入是为 FHESwapUser 的 mint 函数准备的
    const encryptedAmount0 = await fhevm.createEncryptedInput(fHeSwapAddress, owner.address).add64(initialReserveAmountA).encrypt();
    console.log(`创建加密输入 (FHESwapUser mint TokenA): Handle=${ethersjs.hexlify(encryptedAmount0.handles[0])}, Proof=${ethersjs.hexlify(encryptedAmount0.inputProof)}`);
    const encryptedAmount1 = await fhevm.createEncryptedInput(fHeSwapAddress, owner.address).add64(initialReserveAmountB).encrypt();
    console.log(`创建加密输入 (FHESwapUser mint TokenB): Handle=${ethersjs.hexlify(encryptedAmount1.handles[0])}, Proof=${ethersjs.hexlify(encryptedAmount1.inputProof)}`);
    console.log(`准备注入 FHESwapUser TokenA: ${ethersjs.formatUnits(initialReserveAmountA, 6)}, TokenB: ${ethersjs.formatUnits(initialReserveAmountB, 6)} (加密)。`);

    // Owner 调用 FHESwapUser 合约的 mint 函数，提供加密 TokenA 和 TokenB 作为流动性
    await fHeSwap.connect(owner).mint(
      encryptedAmount0.handles[0],
      encryptedAmount0.inputProof,
      encryptedAmount1.handles[0],
      encryptedAmount1.inputProof
    );
    console.log("FHESwapUser.mint 调用完成，流动性注入。");

    // 验证 FHESwapUser 合约的内部储备 (加密状态)
    console.log("验证 FHESwapUser 储备:");
    // 获取 FHESwapUser 合约的加密 reserve0
    const encryptedReserve0 = await fHeSwap.getEncryptedReserve0();
    // 为链下验证解密 reserve0。需要提供 FHE 类型、加密值、关联合约地址和解密者。
    const decryptedReserve0 = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(encryptedReserve0),
      fHeSwapAddress,
      owner // 因为 reserve0 允许 owner 访问
    );
    console.log(`解密 FHESwapUser reserve0: ${ethersjs.formatUnits(decryptedReserve0, 6)} (预期: ${ethersjs.formatUnits(initialReserveAmountA, 6)})`);
    // 断言解密 reserve0 等于初始设置的流动性金额
    expect(decryptedReserve0).to.equal(initialReserveAmountA);

    // 获取 FHESwapUser 合约的加密 reserve1
    const encryptedReserve1 = await fHeSwap.getEncryptedReserve1();
    // 解密 reserve1
    const decryptedReserve1 = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(encryptedReserve1),
      fHeSwapAddress,
      owner
    );
    console.log(`解密 FHESwapUser reserve1: ${ethersjs.formatUnits(decryptedReserve1, 6)} (预期: ${ethersjs.formatUnits(initialReserveAmountB, 6)})`);
    // 断言解密 reserve1 等于初始设置的流动性金额
    expect(decryptedReserve1).to.equal(initialReserveAmountB);
    console.log("--- 初始流动性注入测试通过 ---\n");
  });

  /**
   * @dev 测试用户 (Alice) 是否可以成功使用手续费将 TokenA 交换为 TokenB。
   * 此测试模拟 FHEVM 中的链上计算，使用自定义除法和验证过程。
   */
  it("should allow a user to swap TokenA for TokenB with fees", async function () {
    console.log("--- 测试: 用户将 TokenA 交换为 TokenB ---");
    const owner = signers.deployer; // 部署者账户
    const alice = signers.alice;   // 用户账户
    const swapAmount = 1;        // 要交换的 TokenA 金额
    console.log(`交换金额: ${swapAmount}, 初始储备: TokenA: ${ethersjs.formatUnits(initialReserveAmountA, 6)}, TokenB: ${ethersjs.formatUnits(initialReserveAmountB, 6)}`);

    // 确保 Alice 有足够的 TokenA 进行交换
    console.log("Alice 获取 TokenA:");
    // Owner 向 Alice 铸造 swapAmount 的 TokenA
    const encryptedAliceMintA = await fhevm.createEncryptedInput(tokenAAddress, owner.address).add64(ethersjs.parseUnits(swapAmount.toString(), 6)).encrypt();
    console.log(`创建加密输入 (Alice 铸造 TokenA): Handle=${ethersjs.hexlify(encryptedAliceMintA.handles[0])}, Proof=${ethersjs.hexlify(encryptedAliceMintA.inputProof)}`);
    await tokenA.connect(owner).mint(alice.address, encryptedAliceMintA.handles[0], encryptedAliceMintA.inputProof);
    console.log(`Owner 向 Alice 铸造 ${swapAmount} TokenA。`);

    // 获取 Alice 在 TokenA 中的加密余额句柄
    const aliceTokenAEncryptedBalanceAtMint = await tokenA.confidentialBalanceOf(alice.address);
    console.log(`Alice 在 TokenA 中的加密余额句柄: ${ethersjs.hexlify(aliceTokenAEncryptedBalanceAtMint)}`);
    // 授权 TokenA 合约操作 Alice 的加密 TokenA 余额
    await tokenA.connect(alice).authorizeSelf(aliceTokenAEncryptedBalanceAtMint);
    console.log(`Alice 授权 TokenA 合约操作她的 TokenA 加密余额 (句柄: ${ethersjs.hexlify(aliceTokenAEncryptedBalanceAtMint)}, 授权至: ${tokenAAddress})。`);

    // 解密 Alice 在 TokenA 中的余额以用于诊断打印
    const decryptedAliceTokenA = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(aliceTokenAEncryptedBalanceAtMint),
      tokenAAddress,
      alice
    );
    console.log(`诊断: Alice 的 TokenA 余额 (解密): ${ethersjs.formatUnits(decryptedAliceTokenA, 6)}`);

    // Alice 授权 FHESwapUser 合约作为 TokenA 的操作员
    console.log("Alice 批准 FHESwapUser 作为 TokenA 的操作员:");
    // 授权 FHESwapUser 合约从 Alice 地址转移 TokenA
    const operatorExpiry = Math.floor(Date.now() / 1000) + 3600;
    await tokenA.connect(alice).setOperator(fHeSwapAddress, operatorExpiry);
    console.log(`Alice 批准 FHESwapUser 作为 TokenA 操作员 (FHESwapUser 地址: ${fHeSwapAddress}, 过期: ${operatorExpiry})。`);

    // // 调试信息：检查变量状态
    // console.log("=== 调试信息 ===");
    // console.log("fHeSwap:", fHeSwap);
    // console.log("fHeSwapAddress:", fHeSwapAddress);
    // console.log("fHeSwap type:", typeof fHeSwap);
    // console.log("fHeSwap 是否有 getAmountOut 方法:", fHeSwap && typeof fHeSwap.getAmountOut);
    console.log("================");

    // 1. Alice 调用 FHESwapUser 的 getAmountOut 函数获取加密 amountOut (链上计算，使用自定义除法)
    console.log("1. Alice 调用 getAmountOut 获取加密 amountOut (链上计算):");
    // 创建加密输入，目标合约是 FHESwapUser，发起人是 alice，值为 swapAmount (euint64 类型)
    const encryptedSwapAmountIn = await fhevm.createEncryptedInput(fHeSwapAddress, alice.address).add64(ethersjs.parseUnits(swapAmount.toString(), 6)).encrypt();
    console.log(`创建加密输入 (交换 AmountIn): Handle=${ethersjs.hexlify(encryptedSwapAmountIn.handles[0])}, Proof=${ethersjs.hexlify(encryptedSwapAmountIn.inputProof)}`);
    
    // 确保 fHeSwap 已正确初始化
    if (!fHeSwap || typeof fHeSwap.getAmountOut !== 'function') {
      throw new Error("fHeSwap 未正确初始化或缺少 getAmountOut 方法");
    }
    
    // Alice 调用 getAmountOut，传入加密输入金额和输入 token 地址
    console.log("准备连接 alice 到合约...");
    const fHeSwapConnectedToAlice = fHeSwap.connect(alice);
    // console.log("连接后的合约:", fHeSwapConnectedToAlice);
    // console.log("连接后的合约是否有 getAmountOut:", fHeSwapConnectedToAlice && typeof fHeSwapConnectedToAlice.getAmountOut);
    
    await fHeSwapConnectedToAlice.getAmountOut(
      encryptedSwapAmountIn.handles[0],
      encryptedSwapAmountIn.inputProof,
      tokenAAddress // 指定输入 token 为 TokenA
    );
    console.log("getAmountOut 调用完成。");
    
    // 获取计算结果
    const encryptedAmountOut = await fHeSwapConnectedToAlice.getLastAmountOut();
    console.log("获取到加密的 amountOut。");

    // 2. Alice 链下解密 amountOut
    console.log("2. Alice 链下解密 amountOut:");
    // 解密 amountOut
    const decryptedAmountOut = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(encryptedAmountOut),
      fHeSwapAddress,
      alice
    );
    console.log(`解密 amountOut: ${ethersjs.formatUnits(decryptedAmountOut, 6)}`);

    // 3. Alice 链下计算带有 slippage 的最小预期输出金额
    console.log("3. Alice 链下计算带有 slippage 的最小预期输出金额:");
    const slippageTolerance = 0.01; // 1% slippage 容忍度
    const minClearAmountOut = (decryptedAmountOut * 99n) / 100n;
    console.log(`Slippage 容忍度: ${slippageTolerance * 100}%, 最小预期输出金额 (minClearAmountOut): ${ethersjs.formatUnits(minClearAmountOut, 6)}`);

    // 4. Alice 重新加密预期输出金额和最小预期输出金额以供链上使用
    console.log("4. Alice 重新加密预期输出金额和最小预期输出金额:");
    // 再次强调: 目标合约是 fHeSwapAddress
    const encryptedExpectedAmountOut = await fhevm.createEncryptedInput(fHeSwapAddress, alice.address).add64(decryptedAmountOut).encrypt();
    console.log(`重新加密预期输出金额: Handle=${ethersjs.hexlify(encryptedExpectedAmountOut.handles[0])}, Proof=${ethersjs.hexlify(encryptedExpectedAmountOut.inputProof)}`);
    const encryptedMinAmountOut = await fhevm.createEncryptedInput(fHeSwapAddress, alice.address).add64(minClearAmountOut).encrypt();
    console.log(`重新加密最小预期输出金额: Handle=${ethersjs.hexlify(encryptedMinAmountOut.handles[0])}, Proof=${ethersjs.hexlify(encryptedMinAmountOut.inputProof)}`);
    console.log("重新加密完成。");

    // 5. Alice 执行交换 (链上交易)
    console.log("5. Alice 执行交换 (链上交易):");
    console.log(`调用 fHeSwap.swap 的参数:\n  encryptedSwapAmountIn.handles[0]: ${ethersjs.hexlify(encryptedSwapAmountIn.handles[0])}\n  encryptedSwapAmountIn.inputProof: ${ethersjs.hexlify(encryptedSwapAmountIn.inputProof)}\n  encryptedExpectedAmountOut.handles[0]: ${ethersjs.hexlify(encryptedExpectedAmountOut.handles[0])}\n  encryptedExpectedAmountOut.inputProof: ${ethersjs.hexlify(encryptedExpectedAmountOut.inputProof)}\n  encryptedMinAmountOut.handles[0]: ${ethersjs.hexlify(encryptedMinAmountOut.handles[0])}\n  encryptedMinAmountOut.inputProof: ${ethersjs.hexlify(encryptedMinAmountOut.inputProof)}\n  tokenAAddress: ${tokenAAddress}\n  alice.address: ${alice.address}`);

    await fHeSwap.connect(alice).swap(
      encryptedSwapAmountIn.handles[0],    // 加密输入金额句柄
      encryptedSwapAmountIn.inputProof,    // 加密输入金额证明
      encryptedExpectedAmountOut.handles[0], // 重新加密预期输出金额句柄
      encryptedExpectedAmountOut.inputProof, // 重新加密预期输出金额证明
      encryptedMinAmountOut.handles[0],    // 重新加密最小预期输出金额句柄
      encryptedMinAmountOut.inputProof,    // 重新加密最小预期输出金额证明
      tokenAAddress,                       // 输入 token 为 TokenA
      alice.address                        // 输出 token 接收者为 Alice
    );
    console.log("FHESwapUser.swap 调用完成。");

    // 交换后，验证 Alice 的余额
    console.log("验证 Alice 的余额:");

    // 获取 Alice 在 TokenA 中的加密余额
    const aliceTokenAEncryptedBalance = await tokenA.confidentialBalanceOf(alice.address);
    
    // 解密 Alice 的 TokenA 余额
    const aliceTokenADecryptedBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(aliceTokenAEncryptedBalance),
      tokenAAddress,
      alice
    );
    console.log(`Alice 的 TokenA 余额 (解密): ${ethersjs.formatUnits(aliceTokenADecryptedBalance, 6)}`);

    // 获取 Alice 在 TokenB 中的加密余额
    const aliceTokenBEncryptedBalance = await tokenB.confidentialBalanceOf(alice.address);
    
    // 解密 Alice 的 TokenB 余额
    const aliceTokenBDecryptedBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(aliceTokenBEncryptedBalance),
      tokenBAddress,
      alice
    );
    console.log(`Alice 的 TokenB 余额 (解密): ${ethersjs.formatUnits(aliceTokenBDecryptedBalance, 6)}`);

    // 计算 Alice 的预期最终余额
    const expectedAliceTokenA = 0n; // Alice 交换了所有初始 TokenA
    // Alice 的 TokenB 余额 = 收到的预期 TokenB 金额 (假设 Alice 初始没有 TokenB)
    const expectedAliceTokenB = decryptedAmountOut;

    // 断言 Alice 的 TokenA 余额为 0
    expect(aliceTokenADecryptedBalance).to.equal(expectedAliceTokenA);
    
    // 断言 Alice 的 TokenB 余额匹配预期金额
    expect(aliceTokenBDecryptedBalance).to.equal(expectedAliceTokenB);
    console.log("Alice 的余额验证通过。");

    // 验证 FHESwapUser 的储备在交换后是否正确更新
    console.log("验证 FHESwapUser 储备更新:");
    
    // 获取 FHESwapUser 的加密 reserve0
    const fHeSwapReserve0Encrypted = await fHeSwap.getEncryptedReserve0();
    
    // 解密 FHESwapUser 的 reserve0
    const fHeSwapReserve0Decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(fHeSwapReserve0Encrypted),
      fHeSwapAddress,
      owner // Owner 可以解密储备
    );
    console.log(`FHESwapUser reserve0 (解密): ${ethersjs.formatUnits(fHeSwapReserve0Decrypted, 6)}`);

    // 获取 FHESwapUser 的加密 reserve1
    const fHeSwapReserve1Encrypted = await fHeSwap.getEncryptedReserve1();
    
    // 解密 FHESwapUser 的 reserve1
    const fHeSwapReserve1Decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(fHeSwapReserve1Encrypted),
      fHeSwapAddress,
      owner
    );
    console.log(`FHESwapUser reserve1 (解密): ${ethersjs.formatUnits(fHeSwapReserve1Decrypted, 6)}`);

    // 计算 FHESwapUser 的预期最终储备
    // FHESwapUser 的 reserve0 = 初始储备 + 交换入的 TokenA 金额
    const expectedFHeSwapReserve0 = initialReserveAmountA + ethersjs.parseUnits(swapAmount.toString(), 6);
   
    // FHESwapUser 的 reserve1 = 初始储备 - 交换出的 TokenB 金额
    const expectedFHeSwapReserve1 = initialReserveAmountB - decryptedAmountOut;

    // 断言 FHESwapUser 的 reserve0 匹配预期金额
    expect(fHeSwapReserve0Decrypted).to.equal(expectedFHeSwapReserve0);
   
    // 断言 FHESwapUser 的 reserve1 匹配预期金额
    expect(fHeSwapReserve1Decrypted).to.equal(expectedFHeSwapReserve1);
    console.log("FHESwapUser 储备验证通过。");
    console.log("--- 交换测试通过 ---\n");
  });
});