import { FHESwap, FHESwap__factory, ConfidentialFungibleTokenMintableBurnable, ConfidentialFungibleTokenMintableBurnable__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import hre from "hardhat";
import { ethers as ethersjs } from "ethers";

/**
 * @dev 定义测试中使用的签名者类型。
 * deployer: 部署合约的账户，通常是测试中的"所有者"或"管理员"。
 * alice: 模拟常规用户交互的账户。
 * bob: 另一个模拟常规用户交互的账户。
 */
type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

/**
 * @dev 部署 ConfidentialFungibleTokenMintableBurnable 和 FHESwap 合约的辅助函数。
 * @param deployerAddress 合约的部署者地址，也将是代币合约和 FHESwap 合约的所有者。
 * @returns 包含已部署代币合约实例、地址以及 FHESwap 合约实例和地址的对象。
 */
async function deployTokenAndSwapFixture(deployerAddress: string) {
  console.log("\n--- 部署合约 ---");
  // 获取 ConfidentialFungibleTokenMintableBurnable 合约工厂
  const tokenFactory = (await ethers.getContractFactory("ConfidentialFungibleTokenMintableBurnable")) as ConfidentialFungibleTokenMintableBurnable__factory;
  // 部署 TokenA，名称为 "TokenA"，符号为 "TKA"
  const tokenA = (await tokenFactory.deploy(deployerAddress, "TokenA", "TKA", "https://example.com/metadataA")) as ConfidentialFungibleTokenMintableBurnable;
  // 部署 TokenB，名称为 "TokenB"，符号为 "TKB"
  const tokenB = (await tokenFactory.deploy(deployerAddress, "TokenB", "TKB", "https://example.com/metadataB")) as ConfidentialFungibleTokenMintableBurnable;

  // 获取已部署的 TokenA 和 TokenB 合约地址
  const tokenAAddress = await tokenA.getAddress();
  const tokenBAddress = await tokenB.getAddress();
  console.log(`TokenA 部署在: ${tokenAAddress}`);
  console.log(`TokenB 部署在: ${tokenBAddress}`);

  // 获取 FHESwap 合约工厂
  const swapFactory = (await ethers.getContractFactory("FHESwap")) as FHESwap__factory;
  // 部署 FHESwap 合约，传入 TokenA 和 TokenB 地址，以及部署者地址作为所有者
  const fHeSwap = (await swapFactory.deploy(tokenAAddress, tokenBAddress, deployerAddress)) as FHESwap;
  // 获取已部署的 FHESwap 合约地址
  const fHeSwapAddress = await fHeSwap.getAddress();
  console.log(`FHESwap 部署在: ${fHeSwapAddress}`);
  console.log("--- 合约部署完成 ---\n");

  // 返回所有已部署的合约实例和地址
  return { tokenA, tokenB, tokenAAddress, tokenBAddress, fHeSwap, fHeSwapAddress };
}

/**
 * @dev FHESwap 合约的测试套件。
 * 包括部署、流动性提供和代币交换的测试。
 */
describe("FHESwap", function () {
  // 定义测试中使用的签名者和合约实例变量
  let signers: Signers;
  let tokenA: ConfidentialFungibleTokenMintableBurnable;
  let tokenB: ConfidentialFungibleTokenMintableBurnable;
  let tokenAAddress: string;
  let tokenBAddress: string;
  let fHeSwap: FHESwap;
  let fHeSwapAddress: string;
  let initialReserveAmountA: bigint;
  let initialReserveAmountB: bigint;

  // 在所有测试用例之前执行一次的钩子函数
  before(async function () {
    console.log("--- 测试初始化 ---");
    // 初始化 FHEVM CLI API，这是与 FHEVM 交互所必需的
    await fhevm.initializeCLIApi();
    // 获取 Hardhat 提供的以太坊签名者（账户）
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    // 将签名者分配给命名变量以供后续使用
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
    console.log(`部署者地址: ${signers.deployer.address}`);
    console.log(`Alice 地址: ${signers.alice.address}`);
    console.log(`Bob 地址: ${signers.bob.address}`);

    // 调用辅助函数部署所有合约，并将解构赋值分配给相应变量
    ({ tokenA, tokenB, tokenAAddress, tokenBAddress, fHeSwap, fHeSwapAddress } = await deployTokenAndSwapFixture(await signers.deployer.getAddress()));

    // 断言 FHEVM 协处理器已初始化。这对于确保 FHE 操作正常工作至关重要。
    await hre.fhevm.assertCoprocessorInitialized(tokenA, "ConfidentialFungibleTokenMintableBurnable");
    await hre.fhevm.assertCoprocessorInitialized(tokenB, "ConfidentialFungibleTokenMintableBurnable");
    await hre.fhevm.assertCoprocessorInitialized(fHeSwap, "FHESwap");
    console.log("--- FHEVM 协处理器初始化完成 ---\n");
  });

  /**
   * @dev 测试 FHESwap 合约是否成功部署并检查其初始状态（如 token0、token1、所有者地址）。
   */
  it("应该成功部署 FHESwap 并设置正确的代币地址", async function () {
    console.log("--- 测试: 部署 FHESwap 并设置正确地址 ---");

    // 验证 FHESwap 合约中记录的 token0 地址是否与实际部署的 TokenA 地址匹配
    expect(await fHeSwap.token0()).to.equal(tokenAAddress);
    console.log(`FHESwap.token0: ${await fHeSwap.token0()} (期望: ${tokenAAddress})`);

    // 验证 FHESwap 合约中记录的 token1 地址是否与实际部署的 TokenB 地址匹配
    expect(await fHeSwap.token1()).to.equal(tokenBAddress);
    console.log(`FHESwap.token1: ${await fHeSwap.token1()} (期望: ${tokenBAddress})`);
    
    // 验证 FHESwap 合约的所有者是部署者
    expect(await fHeSwap.owner()).to.equal(signers.deployer.address);
    console.log(`FHESwap.owner: ${await fHeSwap.owner()} (期望: ${signers.deployer.address})`);
    console.log("--- 部署测试通过 ---\n");
  });

  /**
   * @dev 测试所有者（部署者）是否能够成功向 FHESwap 合约铸造初始流动性。
   * 这包括向自己铸造代币，授权 FHESwap 合约作为操作者，然后调用 FHESwap 的 mint 函数。
   * 最后，验证 FHESwap 合约内部的加密储备是否正确更新。
   */
  it("应该允许所有者铸造初始流动性", async function () {
    console.log("--- 测试: 所有者铸造初始流动性 ---");
    const owner = signers.deployer; // 将所有者定义为部署者账户
    initialReserveAmountA = ethersjs.parseUnits("1000", 6); // 初始流动性数量
    initialReserveAmountB = ethersjs.parseUnits("300", 6); // 初始流动性数量
    console.log(`初始储备数量 TokenA: ${ethersjs.formatUnits(initialReserveAmountA, 6)}, TokenB: ${ethersjs.formatUnits(initialReserveAmountB, 6)}`);

    // 1. 所有者首先向自己铸造 TokenA 和 TokenB（用于提供流动性）
    console.log("1. 所有者向自己铸造代币:");
    // 创建加密输入，目标合约是 TokenA，发起者是所有者，值是 initialReserveAmount（euint64 类型）
    const encryptedMintA = await fhevm.createEncryptedInput(tokenAAddress, owner.address).add64(initialReserveAmountA).encrypt();
    console.log(`创建加密输入 (TokenA): Handle=${ethersjs.hexlify(encryptedMintA.handles[0])}, Proof=${ethersjs.hexlify(encryptedMintA.inputProof)}`);
    // 所有者调用 TokenA 合约的 mint 函数向自己铸造加密的 TokenA
    await tokenA.connect(owner).mint(owner.address, encryptedMintA.handles[0], encryptedMintA.inputProof);
    console.log(`所有者向自己铸造了 ${ethersjs.formatUnits(initialReserveAmountA, 6)} TokenA。`);

    // 获取所有者在 TokenA 中的加密余额句柄
    const ownerTokenAEncryptedBalance = await tokenA.confidentialBalanceOf(owner.address);
    console.log(`所有者在 TokenA 中的加密余额句柄: ${ethersjs.hexlify(ownerTokenAEncryptedBalance)}`);
    // 授权 TokenA 合约操作所有者的加密 TokenA 余额
    await tokenA.connect(owner).authorizeSelf(ownerTokenAEncryptedBalance);
    console.log(`所有者授权 TokenA 合约操作其加密 TokenA 余额 (句柄: ${ethersjs.hexlify(ownerTokenAEncryptedBalance)}, 授权给: ${tokenAAddress})。`);

    // 解密所有者在 TokenA 中的余额用于诊断打印
    const decryptedOwnerTokenA = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(ownerTokenAEncryptedBalance),
      tokenAAddress,
      owner
    );
    console.log(`诊断: 所有者的 TokenA 余额 (解密后): ${ethersjs.formatUnits(decryptedOwnerTokenA, 6)}`);

    // 创建加密输入，目标合约是 TokenB，发起者是所有者，值是 initialReserveAmount（euint64 类型）
    const encryptedMintB = await fhevm.createEncryptedInput(tokenBAddress, owner.address).add64(initialReserveAmountB).encrypt();
    console.log(`创建加密输入 (TokenB): Handle=${ethersjs.hexlify(encryptedMintB.handles[0])}, Proof=${ethersjs.hexlify(encryptedMintB.inputProof)}`);
    // 所有者调用 TokenB 合约的 mint 函数向自己铸造加密的 TokenB
    await tokenB.connect(owner).mint(owner.address, encryptedMintB.handles[0], encryptedMintB.inputProof);
    console.log(`所有者向自己铸造了 ${ethersjs.formatUnits(initialReserveAmountB, 6)} TokenB。`);

    // 获取所有者在 TokenB 中的加密余额句柄
    const ownerTokenBEncryptedBalance = await tokenB.confidentialBalanceOf(owner.address);
    console.log(`所有者在 TokenB 中的加密余额句柄: ${ethersjs.hexlify(ownerTokenBEncryptedBalance)}`);
    // 授权 TokenB 合约操作所有者的加密 TokenB 余额
    await tokenB.connect(owner).authorizeSelf(ownerTokenBEncryptedBalance);
    console.log(`所有者授权 TokenB 合约操作其加密 TokenB 余额 (句柄: ${ethersjs.hexlify(ownerTokenBEncryptedBalance)}, 授权给: ${tokenBAddress})。`);

    // 2. 所有者授权 FHESwap 合约作为 TokenA 和 TokenB 的操作者
    console.log("2. 所有者批准 FHESwap 作为 TokenA 和 TokenB 的操作者:");
    // operatorExpiry 定义操作者授权的过期时间（当前时间 + 1 小时）
    const operatorExpiry = Math.floor(Date.now() / 1000) + 3600;
    // 所有者调用 TokenA 合约的 setOperator 授权 FHESwap 合约操作所有者的 TokenA
    await tokenA.connect(owner).setOperator(fHeSwapAddress, operatorExpiry);
    console.log(`所有者授权 FHESwap 作为 TokenA 操作者 (FHESwap 地址: ${fHeSwapAddress}, 过期时间: ${operatorExpiry})。`);
    // 所有者调用 TokenB 合约的 setOperator 授权 FHESwap 合约操作所有者的 TokenB
    await tokenB.connect(owner).setOperator(fHeSwapAddress, operatorExpiry);
    console.log(`所有者授权 FHESwap 作为 TokenB 操作者 (FHESwap 地址: ${fHeSwapAddress}, 过期时间: ${operatorExpiry})。`);

    // 3. 所有者向 FHESwap 合约提供流动性
    console.log("3. 所有者向 FHESwap 提供流动性:");
    // 创建加密输入，目标合约是 FHESwap，发起者是所有者，值是 initialReserveAmount（euint64 类型）
    // 注意：这里的目标合约必须是 fHeSwapAddress，因为这些加密输入是为 FHESwap 的 mint 函数准备的
    const encryptedAmount0 = await fhevm.createEncryptedInput(fHeSwapAddress, owner.address).add64(initialReserveAmountA).encrypt();
    console.log(`创建加密输入 (FHESwap mint TokenA): Handle=${ethersjs.hexlify(encryptedAmount0.handles[0])}, Proof=${ethersjs.hexlify(encryptedAmount0.inputProof)}`);
    const encryptedAmount1 = await fhevm.createEncryptedInput(fHeSwapAddress, owner.address).add64(initialReserveAmountB).encrypt();
    console.log(`创建加密输入 (FHESwap mint TokenB): Handle=${ethersjs.hexlify(encryptedAmount1.handles[0])}, Proof=${ethersjs.hexlify(encryptedAmount1.inputProof)}`);
    console.log(`准备注入到 FHESwap TokenA: ${ethersjs.formatUnits(initialReserveAmountA, 6)}, TokenB: ${ethersjs.formatUnits(initialReserveAmountB, 6)} (已加密)。`);

    // 所有者调用 FHESwap 合约的 mint 函数提供加密的 TokenA 和 TokenB 作为流动性
    await fHeSwap.connect(owner).mint(
      encryptedAmount0.handles[0],
      encryptedAmount0.inputProof,
      encryptedAmount1.handles[0],
      encryptedAmount1.inputProof
    );
    console.log("FHESwap.mint 调用完成，流动性已注入。");

    // 验证 FHESwap 合约的内部储备（加密状态）
    console.log("验证 FHESwap 储备:");
    // 获取 FHESwap 合约的加密 reserve0
    const encryptedReserve0 = await fHeSwap.getEncryptedReserve0();
    // 解密 reserve0 用于链下验证。需要提供 FHE 类型、加密值、关联合约地址和解密者。
    const decryptedReserve0 = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(encryptedReserve0),
      fHeSwapAddress,
      owner // 这是所有者，因为 reserve0 允许所有者访问
    );
    console.log(`解密的 FHESwap reserve0: ${ethersjs.formatUnits(decryptedReserve0, 6)} (期望: ${ethersjs.formatUnits(initialReserveAmountA, 6)})`);
    // 断言解密的 reserve0 等于初始设置的流动性数量
    expect(decryptedReserve0).to.equal(initialReserveAmountA);

    // 获取 FHESwap 合约的加密 reserve1
    const encryptedReserve1 = await fHeSwap.getEncryptedReserve1();
    // 解密 reserve1
    const decryptedReserve1 = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(encryptedReserve1),
      fHeSwapAddress,
      owner
    );
    console.log(`解密的 FHESwap reserve1: ${ethersjs.formatUnits(decryptedReserve1, 6)} (期望: ${ethersjs.formatUnits(initialReserveAmountB, 6)})`);
    // 断言解密的 reserve1 等于初始设置的流动性数量
    expect(decryptedReserve1).to.equal(initialReserveAmountB);
    console.log("--- 初始流动性注入测试通过 ---\n");
  });

  /**
   * @dev 测试用户（Alice）是否能够成功用手续费将 TokenA 交换为 TokenB。
   * 此测试模拟 FHEVM 中的链下计算和链上验证过程。
   */
  it("应该允许用户用手续费将 TokenA 交换为 TokenB", async function () {
    console.log("--- 测试: 用户将 TokenA 交换为 TokenB ---");
    const owner = signers.deployer; // 部署者账户
    const alice = signers.alice;   // 用户账户
    const swapAmount = 10;        // 要交换的 TokenA 数量
    console.log(`交换数量: ${swapAmount}, 初始储备: TokenA: ${ethersjs.formatUnits(initialReserveAmountA, 6)}, TokenB: ${ethersjs.formatUnits(initialReserveAmountB, 6)}`);

    // 确保 Alice 有足够的 TokenA 进行交换
    console.log("Alice 获得 TokenA:");
    // 所有者向 Alice 铸造 swapAmount 的 TokenA
    const encryptedAliceMintA = await fhevm.createEncryptedInput(tokenAAddress, owner.address).add64(ethersjs.parseUnits(swapAmount.toString(), 6)).encrypt();
    console.log(`创建加密输入 (Alice 铸造 TokenA): Handle=${ethersjs.hexlify(encryptedAliceMintA.handles[0])}, Proof=${ethersjs.hexlify(encryptedAliceMintA.inputProof)}`);
    await tokenA.connect(owner).mint(alice.address, encryptedAliceMintA.handles[0], encryptedAliceMintA.inputProof);
    console.log(`所有者向 Alice 铸造了 ${swapAmount} TokenA。`);

    // 获取 Alice 在 TokenA 中的加密余额句柄
    const aliceTokenAEncryptedBalanceAtMint = await tokenA.confidentialBalanceOf(alice.address);
    console.log(`Alice 在 TokenA 中的加密余额句柄: ${ethersjs.hexlify(aliceTokenAEncryptedBalanceAtMint)}`);
    // 授权 TokenA 合约操作 Alice 的加密 TokenA 余额
    await tokenA.connect(alice).authorizeSelf(aliceTokenAEncryptedBalanceAtMint);
    console.log(`Alice 授权 TokenA 合约操作其 TokenA 加密余额 (句柄: ${ethersjs.hexlify(aliceTokenAEncryptedBalanceAtMint)}, 授权给: ${tokenAAddress})。`);

    console.log(`Alice 授权 TokenA 合约操作其 TokenA 加密余额。`);

    // 解密 Alice 在 TokenA 中的余额用于诊断打印
    const decryptedAliceTokenA = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(aliceTokenAEncryptedBalanceAtMint),
      tokenAAddress,
      alice
    );
    console.log(`诊断: Alice 的 TokenA 余额 (解密后): ${ethersjs.formatUnits(decryptedAliceTokenA, 6)}`);

    // Alice 授权 FHESwap 合约作为 TokenA 的操作者
    console.log("Alice 批准 FHESwap 作为 TokenA 的操作者:");
    // 授权 FHESwap 合约从 Alice 的地址转移 TokenA
    const operatorExpiry = Math.floor(Date.now() / 1000) + 3600;
    await tokenA.connect(alice).setOperator(fHeSwapAddress, operatorExpiry);
    console.log(`Alice 批准 FHESwap 作为 TokenA 操作者 (FHESwap 地址: ${fHeSwapAddress}, 过期时间: ${operatorExpiry})。`);

    // 1. Alice 调用 FHESwap 的 getAmountOut 函数获取分子和分母（链上加密计算）
    console.log("1. Alice 调用 getAmountOut 获取分子和分母（链上加密计算）:");
    // 创建加密输入，目标合约是 FHESwap，发起者是 alice，值是 swapAmount（euint64 类型）
    const encryptedSwapAmountIn = await fhevm.createEncryptedInput(fHeSwapAddress, alice.address).add64(ethersjs.parseUnits(swapAmount.toString(), 6)).encrypt();
    console.log(`创建加密输入 (交换 AmountIn): Handle=${ethersjs.hexlify(encryptedSwapAmountIn.handles[0])}, Proof=${ethersjs.hexlify(encryptedSwapAmountIn.inputProof)}`);
    // Alice 调用 getAmountOut，传入加密输入数量和输入代币地址
    await fHeSwap.connect(alice).getAmountOut(
      encryptedSwapAmountIn.handles[0],
      encryptedSwapAmountIn.inputProof,
      tokenAAddress // 指定输入代币是 TokenA
    );
    console.log("getAmountOut 调用完成。");

    // 获取链上计算的加密分子和分母
    const encryptedNumerator = await fHeSwap.connect(alice).getEncryptedNumerator();
    console.log(`获得加密分子: ${ethersjs.hexlify(encryptedNumerator)}`);
    const encryptedDenominator = await fHeSwap.connect(alice).getEncryptedDenominator();
    console.log(`获得加密分母: ${ethersjs.hexlify(encryptedDenominator)}`);

    // 2. Alice 在链下解密分子和分母
    console.log("2. Alice 在链下解密分子和分母:");
    // 解密分子
    const decryptedNumerator = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(encryptedNumerator),
      fHeSwapAddress,
      alice
    );
    console.log(`解密分子: ${ethersjs.formatUnits(decryptedNumerator, 6)}`);
    // 解密分母
    const decryptedDenominator = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(encryptedDenominator),
      fHeSwapAddress,
      alice
    );
    console.log(`解密分母: ${ethersjs.formatUnits(decryptedDenominator, 6)}`);

    // 3. Alice 在链下计算预期输出数量（明文除法）
    console.log("3. Alice 在链下计算预期输出数量:");
    // 注意：FHEVM 不支持加密除法，所以这一步必须在链下完成
    const expectedClearAmountOut = decryptedNumerator / decryptedDenominator;
    console.log(`链下计算的预期输出数量 (expectedClearAmountOut): ${ethersjs.formatUnits(expectedClearAmountOut, 6)}`);

    // 4. Alice 在链下计算带滑点的最小预期输出数量
    console.log("4. Alice 在链下计算带滑点的最小预期输出数量:");
    const slippageTolerance = 0.01; // 1% 滑点容忍度
    const minClearAmountOut = (expectedClearAmountOut * 99n) / 100n;
    console.log(`滑点容忍度: ${slippageTolerance * 100}%, 最小预期输出数量 (minClearAmountOut): ${ethersjs.formatUnits(minClearAmountOut, 6)}`);

    // 5. Alice 重新加密预期输出数量和最小预期输出数量以供链上使用
    console.log("5. Alice 重新加密预期输出数量和最小预期输出数量:");
    // 再次强调：目标合约是 fHeSwapAddress
    const encryptedExpectedAmountOut = await fhevm.createEncryptedInput(fHeSwapAddress, alice.address).add64(expectedClearAmountOut).encrypt();
    console.log(`重新加密预期输出数量: Handle=${ethersjs.hexlify(encryptedExpectedAmountOut.handles[0])}, Proof=${ethersjs.hexlify(encryptedExpectedAmountOut.inputProof)}`);
    const encryptedMinAmountOut = await fhevm.createEncryptedInput(fHeSwapAddress, alice.address).add64(minClearAmountOut).encrypt();
    console.log(`重新加密最小预期输出数量: Handle=${ethersjs.hexlify(encryptedMinAmountOut.handles[0])}, Proof=${ethersjs.hexlify(encryptedMinAmountOut.inputProof)}`);
    console.log("重新加密完成。");

    // 6. Alice 执行交换（链上交易）
    console.log("6. Alice 执行交换（链上交易）:");
    console.log(`调用 fHeSwap.swap 的参数:\n  encryptedSwapAmountIn.handles[0]: ${ethersjs.hexlify(encryptedSwapAmountIn.handles[0])}\n  encryptedSwapAmountIn.inputProof: ${ethersjs.hexlify(encryptedSwapAmountIn.inputProof)}\n  encryptedExpectedAmountOut.handles[0]: ${ethersjs.hexlify(encryptedExpectedAmountOut.handles[0])}\n  encryptedExpectedAmountOut.inputProof: ${ethersjs.hexlify(encryptedExpectedAmountOut.inputProof)}\n  encryptedMinAmountOut.handles[0]: ${ethersjs.hexlify(encryptedMinAmountOut.handles[0])}\n  encryptedMinAmountOut.inputProof: ${ethersjs.hexlify(encryptedMinAmountOut.inputProof)}\n  tokenAAddress: ${tokenAAddress}\n  alice.address: ${alice.address}`);

    await fHeSwap.connect(alice).swap(
      encryptedSwapAmountIn.handles[0],    // 加密输入数量句柄
      encryptedSwapAmountIn.inputProof,    // 加密输入数量证明
      encryptedExpectedAmountOut.handles[0], // 重新加密预期输出数量句柄
      encryptedExpectedAmountOut.inputProof, // 重新加密预期输出数量证明
      encryptedMinAmountOut.handles[0],    // 重新加密最小预期输出数量句柄
      encryptedMinAmountOut.inputProof,    // 重新加密最小预期输出数量证明
      tokenAAddress,                       // 输入代币是 TokenA
      alice.address                        // 输出代币接收者是 Alice
    );
    console.log("FHESwap.swap 调用完成。");

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
    console.log(`Alice 的 TokenA 余额 (解密后): ${ethersjs.formatUnits(aliceTokenADecryptedBalance, 6)}`);

    // 获取 Alice 在 TokenB 中的加密余额
    const aliceTokenBEncryptedBalance = await tokenB.confidentialBalanceOf(alice.address);
    
    // 解密 Alice 的 TokenB 余额
    const aliceTokenBDecryptedBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(aliceTokenBEncryptedBalance),
      tokenBAddress,
      alice
    );
    console.log(`Alice 的 TokenB 余额 (解密后): ${ethersjs.formatUnits(aliceTokenBDecryptedBalance, 6)}`);

    // 计算 Alice 的预期最终余额
    const expectedAliceTokenA = 0n; // Alice 交换了她所有的初始 TokenA
    // Alice 的 TokenB 余额 = 预期的 TokenB 接收数量（因为 Alice 最初没有 TokenB）
    const expectedAliceTokenB = expectedClearAmountOut;

    // 断言 Alice 的 TokenA 余额为 0
    expect(aliceTokenADecryptedBalance).to.equal(0n);
    
    // 断言 Alice 的 TokenB 余额匹配预期数量
    expect(aliceTokenBDecryptedBalance).to.equal(expectedAliceTokenB);
    console.log("Alice 的余额已验证。");

    // 验证 FHESwap 的储备在交换后是否正确更新
    console.log("验证 FHESwap 储备更新:");
    
    // 获取 FHESwap 的加密 reserve0
    const fHeSwapReserve0Encrypted = await fHeSwap.getEncryptedReserve0();
    
    // 解密 FHESwap 的 reserve0
    const fHeSwapReserve0Decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(fHeSwapReserve0Encrypted),
      fHeSwapAddress,
      owner // 所有者可以解密储备
    );
    console.log(`FHESwap reserve0 (解密后): ${ethersjs.formatUnits(fHeSwapReserve0Decrypted, 6)}`);

    // 获取 FHESwap 的加密 reserve1
    const fHeSwapReserve1Encrypted = await fHeSwap.getEncryptedReserve1();
    
    // 解密 FHESwap 的 reserve1
    const fHeSwapReserve1Decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethersjs.hexlify(fHeSwapReserve1Encrypted),
      fHeSwapAddress,
      owner
    );
    console.log(`FHESwap reserve1 (解密后): ${ethersjs.formatUnits(fHeSwapReserve1Decrypted, 6)}`);

    // 计算 FHESwap 的预期最终储备
    // FHESwap 的 reserve0 = 初始储备 + 交换进的 TokenA 数量
    const expectedFHeSwapReserve0 = initialReserveAmountA + ethersjs.parseUnits(swapAmount.toString(), 6);
   
    // FHESwap 的 reserve1 = 初始储备 - 交换出的 TokenB 数量
    const expectedFHeSwapReserve1 = initialReserveAmountB - expectedClearAmountOut;

    // 断言 FHESwap 的 reserve0 匹配预期数量
    expect(fHeSwapReserve0Decrypted).to.equal(expectedFHeSwapReserve0);
   
    // 断言 FHESwap 的 reserve1 匹配预期数量
    expect(fHeSwapReserve1Decrypted).to.equal(expectedFHeSwapReserve1);
    console.log("FHESwap 储备已验证。");
    console.log("--- 交换测试通过 ---\n");
  });

  // /**
  //  * @dev 测试当预期输出数量小于最小预期输出数量时的情况。
  //  * 在这种情况下，交换不应该转移任何代币（actualTransferAmount = 0）。
  //  */
  // it("当预期输出小于最小预期时不应该转移代币", async function () {
  //   console.log("--- 测试: 预期输出 < 最小预期（无转移） ---");
  //   const owner = signers.deployer;
  //   const bob = signers.bob;   // 使用 Bob 进行此测试
  //   const swapAmount = 5;      // 要交换的 TokenA 数量
  //   console.log(`交换数量: ${swapAmount}, 初始储备: TokenA: ${ethersjs.formatUnits(initialReserveAmountA, 6)}, TokenB: ${ethersjs.formatUnits(initialReserveAmountB, 6)}`);

  //   // 确保 Bob 有足够的 TokenA 进行交换
  //   console.log("Bob 获得 TokenA:");
  //   const encryptedBobMintA = await fhevm.createEncryptedInput(tokenAAddress, owner.address).add64(ethersjs.parseUnits(swapAmount.toString(), 6)).encrypt();
  //   console.log(`创建加密输入 (Bob 铸造 TokenA): Handle=${ethersjs.hexlify(encryptedBobMintA.handles[0])}, Proof=${ethersjs.hexlify(encryptedBobMintA.inputProof)}`);
  //   await tokenA.connect(owner).mint(bob.address, encryptedBobMintA.handles[0], encryptedBobMintA.inputProof);
  //   console.log(`所有者向 Bob 铸造了 ${swapAmount} TokenA。`);

  //   // 获取 Bob 在 TokenA 中的加密余额句柄
  //   const bobTokenAEncryptedBalanceAtMint = await tokenA.confidentialBalanceOf(bob.address);
  //   console.log(`Bob 在 TokenA 中的加密余额句柄: ${ethersjs.hexlify(bobTokenAEncryptedBalanceAtMint)}`);
  //   // 授权 TokenA 合约操作 Bob 的加密 TokenA 余额
  //   await tokenA.connect(bob).authorizeSelf(bobTokenAEncryptedBalanceAtMint);
  //   console.log(`Bob 授权 TokenA 合约操作其 TokenA 加密余额。`);

  //   // Bob 授权 FHESwap 合约作为 TokenA 的操作者
  //   console.log("Bob 批准 FHESwap 作为 TokenA 的操作者:");
  //   const operatorExpiry = Math.floor(Date.now() / 1000) + 3600;
  //   await tokenA.connect(bob).setOperator(fHeSwapAddress, operatorExpiry);
  //   console.log(`Bob 批准 FHESwap 作为 TokenA 操作者。`);

  //   // 1. Bob 调用 FHESwap 的 getAmountOut 函数获取分子和分母
  //   console.log("1. Bob 调用 getAmountOut 获取分子和分母:");
  //   const encryptedSwapAmountIn = await fhevm.createEncryptedInput(fHeSwapAddress, bob.address).add64(ethersjs.parseUnits(swapAmount.toString(), 6)).encrypt();
  //   console.log(`创建加密输入 (交换 AmountIn): Handle=${ethersjs.hexlify(encryptedSwapAmountIn.handles[0])}, Proof=${ethersjs.hexlify(encryptedSwapAmountIn.inputProof)}`);
    
  //   await fHeSwap.connect(bob).getAmountOut(
  //     encryptedSwapAmountIn.handles[0],
  //     encryptedSwapAmountIn.inputProof,
  //     tokenAAddress
  //   );
  //   console.log("getAmountOut 调用完成。");

  //   // 获取加密分子和分母
  //   const encryptedNumerator = await fHeSwap.connect(bob).getEncryptedNumerator();
  //   const encryptedDenominator = await fHeSwap.connect(bob).getEncryptedDenominator();

  //   // 2. Bob 在链下解密分子和分母
  //   console.log("2. Bob 在链下解密分子和分母:");
  //   const decryptedNumerator = await fhevm.userDecryptEuint(
  //     FhevmType.euint64,
  //     ethersjs.hexlify(encryptedNumerator),
  //     fHeSwapAddress,
  //     bob
  //   );
  //   console.log(`解密分子: ${ethersjs.formatUnits(decryptedNumerator, 6)}`);
    
  //   const decryptedDenominator = await fhevm.userDecryptEuint(
  //     FhevmType.euint64,
  //     ethersjs.hexlify(encryptedDenominator),
  //     fHeSwapAddress,
  //     bob
  //   );
  //   console.log(`解密分母: ${ethersjs.formatUnits(decryptedDenominator, 6)}`);

  //   // 3. Bob 在链下计算预期输出数量
  //   console.log("3. Bob 在链下计算预期输出数量:");
  //   const expectedClearAmountOut = decryptedNumerator / decryptedDenominator;
  //   console.log(`链下计算的预期输出数量: ${ethersjs.formatUnits(expectedClearAmountOut, 6)}`);

  //   // 4. Bob 设置一个高于实际预期输出的最小预期输出数量
  //   // 这模拟了 expectedAmountOut < minAmountOut 的场景
  //   console.log("4. Bob 设置一个高于实际预期输出的最小预期输出数量:");
  //   const minClearAmountOut = expectedClearAmountOut + ethersjs.parseUnits("1", 6); // 设置最小值高于预期
  //   console.log(`最小预期输出数量 (设置高于预期): ${ethersjs.formatUnits(minClearAmountOut, 6)}`);
  //   console.log(`这模拟了 expectedAmountOut (${ethersjs.formatUnits(expectedClearAmountOut, 6)}) < minAmountOut (${ethersjs.formatUnits(minClearAmountOut, 6)})`);

  //   // 5. Bob 重新加密预期输出数量和最小预期输出数量
  //   console.log("5. Bob 重新加密预期输出数量和最小预期输出数量:");
  //   const encryptedExpectedAmountOut = await fhevm.createEncryptedInput(fHeSwapAddress, bob.address).add64(expectedClearAmountOut).encrypt();
  //   const encryptedMinAmountOut = await fhevm.createEncryptedInput(fHeSwapAddress, bob.address).add64(minClearAmountOut).encrypt();
  //   console.log("重新加密完成。");

  //   // 6. Bob 执行交换（链上交易）
  //   console.log("6. Bob 执行交换（链上交易）:");
  //   console.log("预期行为: 由于预期输出不足，不应该转移任何代币。");

  //   await fHeSwap.connect(bob).swap(
  //     encryptedSwapAmountIn.handles[0],
  //     encryptedSwapAmountIn.inputProof,
  //     encryptedExpectedAmountOut.handles[0],
  //     encryptedExpectedAmountOut.inputProof,
  //     encryptedMinAmountOut.handles[0],
  //     encryptedMinAmountOut.inputProof,
  //     tokenAAddress,
  //     bob.address
  //   );
  //   console.log("FHESwap.swap 调用完成。");

  //   // 交换后，验证 Bob 的余额
  //   console.log("验证 Bob 的余额:");

  //   // 获取 Bob 在 TokenA 中的加密余额
  //   const bobTokenAEncryptedBalance = await tokenA.confidentialBalanceOf(bob.address);
    
  //   // 解密 Bob 的 TokenA 余额
  //   const bobTokenADecryptedBalance = await fhevm.userDecryptEuint(
  //     FhevmType.euint64,
  //     ethersjs.hexlify(bobTokenAEncryptedBalance),
  //     tokenAAddress,
  //     bob
  //   );
  //   console.log(`Bob 的 TokenA 余额 (解密后): ${ethersjs.formatUnits(bobTokenADecryptedBalance, 6)}`);

  //   // 获取 Bob 在 TokenB 中的加密余额
  //   const bobTokenBEncryptedBalance = await tokenB.confidentialBalanceOf(bob.address);
    
  //   // 解密 Bob 的 TokenB 余额
  //   const bobTokenBDecryptedBalance = await fhevm.userDecryptEuint(
  //     FhevmType.euint64,
  //     ethersjs.hexlify(bobTokenBEncryptedBalance),
  //     tokenBAddress,
  //     bob
  //   );
  //   console.log(`Bob 的 TokenB 余额 (解密后): ${ethersjs.formatUnits(bobTokenBDecryptedBalance, 6)}`);

  //   // 由于 expectedAmountOut < minAmountOut，不应该转移任何代币
  //   // Bob 应该仍然拥有他原始的 TokenA 数量
  //   const expectedBobTokenA = ethersjs.parseUnits(swapAmount.toString(), 6); // Bob 应该仍然拥有他原始的 TokenA
  //   const expectedBobTokenB = 0n; // Bob 不应该接收任何 TokenB

  //   // 断言 Bob 的 TokenA 余额未改变（没有发生交换）
  //   expect(bobTokenADecryptedBalance).to.equal(expectedBobTokenA);
  //   console.log(`Bob 的 TokenA 余额已验证: ${ethersjs.formatUnits(bobTokenADecryptedBalance, 6)} (未改变)`);
    
  //   // 断言 Bob 的 TokenB 余额为 0（没有发生交换）
  //   expect(bobTokenBDecryptedBalance).to.equal(expectedBobTokenB);
  //   console.log(`Bob 的 TokenB 余额已验证: ${ethersjs.formatUnits(bobTokenBDecryptedBalance, 6)} (未接收代币)`);

  //   // 验证 FHESwap 的储备在失败的交换后未改变
  //   console.log("验证 FHESwap 储备（应该未改变）:");
    
  //   // 获取 FHESwap 的加密 reserve0
  //   const fHeSwapReserve0Encrypted = await fHeSwap.getEncryptedReserve0();
    
  //   // 解密 FHESwap 的 reserve0
  //   const fHeSwapReserve0Decrypted = await fhevm.userDecryptEuint(
  //     FhevmType.euint64,
  //     ethersjs.hexlify(fHeSwapReserve0Encrypted),
  //     fHeSwapAddress,
  //     owner
  //   );
  //   console.log(`FHESwap reserve0 (解密后): ${ethersjs.formatUnits(fHeSwapReserve0Decrypted, 6)}`);

  //   // 获取 FHESwap 的加密 reserve1
  //   const fHeSwapReserve1Encrypted = await fHeSwap.getEncryptedReserve1();
    
  //   // 解密 FHESwap 的 reserve1
  //   const fHeSwapReserve1Decrypted = await fhevm.userDecryptEuint(
  //     FhevmType.euint64,
  //     ethersjs.hexlify(fHeSwapReserve1Encrypted),
  //     fHeSwapAddress,
  //     owner
  //   );
  //   console.log(`FHESwap reserve1 (解密后): ${ethersjs.formatUnits(fHeSwapReserve1Decrypted, 6)}`);

  //   // 由于没有发生交换，储备应该从之前的测试保持不变
  //   // 注意：Alice 的测试已经改变了储备，所以我们需要使用当前值
  //   const expectedFHeSwapReserve0 = ethersjs.parseUnits("1010", 6); // Alice 测试后的当前储备
  //   const expectedFHeSwapReserve1 = ethersjs.parseUnits("297.038526", 6); // Alice 测试后的当前储备

  //   // 断言 FHESwap 的储备未改变
  //   expect(fHeSwapReserve0Decrypted).to.equal(expectedFHeSwapReserve0);
  //   expect(fHeSwapReserve1Decrypted).to.equal(expectedFHeSwapReserve1);
  //   console.log("FHESwap 储备已验证（未改变）。");
  //   console.log("--- 无转移测试通过 ---\n");
  // });
  it("当预期输出小于最小预期时不应该转移代币", async function () {
    console.log("\n--- 测试: 预期输出 < 最小预期（无转移） ---");
    const bob = signers.bob;
    const owner = signers.deployer;
    const swapAmount = 5;
  
    // 设置初始流动性
    console.log("设置初始流动性...");
    // 给所有者铸造代币
    const encryptedMintA = await fhevm.createEncryptedInput(tokenAAddress, owner.address)
      .add64(ethersjs.parseUnits("1000", 6))
      .encrypt();
    const encryptedMintB = await fhevm.createEncryptedInput(tokenBAddress, owner.address)
      .add64(ethersjs.parseUnits("300", 6))
      .encrypt();
    
    await tokenA.connect(owner).mint(owner.address, encryptedMintA.handles[0], encryptedMintA.inputProof);
    await tokenB.connect(owner).mint(owner.address, encryptedMintB.handles[0], encryptedMintB.inputProof);
    
    // 授权 FHESwap 作为操作者
    const operatorExpiry = Math.floor(Date.now() / 1000) + 3600;
    await tokenA.connect(owner).setOperator(fHeSwapAddress, operatorExpiry);
    await tokenB.connect(owner).setOperator(fHeSwapAddress, operatorExpiry);
    
    // 提供流动性
    const encryptedAmount0 = await fhevm.createEncryptedInput(fHeSwapAddress, owner.address)
      .add64(ethersjs.parseUnits("1000", 6))
      .encrypt();
    const encryptedAmount1 = await fhevm.createEncryptedInput(fHeSwapAddress, owner.address)
      .add64(ethersjs.parseUnits("300", 6))
      .encrypt();
    
    await fHeSwap.connect(owner).mint(
      encryptedAmount0.handles[0],
      encryptedAmount0.inputProof,
      encryptedAmount1.handles[0],
      encryptedAmount1.inputProof
    );
  
    // 先给 Bob 铸造 TokenA
    const encryptedBobMintA = await fhevm.createEncryptedInput(tokenAAddress, owner.address)
      .add64(ethersjs.parseUnits(swapAmount.toString(), 6))
      .encrypt();
    await tokenA.connect(owner).mint(bob.address, encryptedBobMintA.handles[0], encryptedBobMintA.inputProof);
  
    const bobTokenABeforeHandle = await tokenA.confidentialBalanceOf(bob.address);
    
    const bobTokenABefore = await fhevm.userDecryptEuint(FhevmType.euint64, ethersjs.hexlify(bobTokenABeforeHandle), tokenAAddress, bob);
    const bobTokenBBefore = 0n; // Bob 初始时没有 TokenB
  
    console.log("Bob 初始余额 -> TokenA:", bobTokenABefore.toString(), "TokenB:", bobTokenBBefore.toString());
  
    await tokenA.connect(bob).authorizeSelf(bobTokenABeforeHandle);
    await tokenA.connect(bob).setOperator(fHeSwapAddress, Math.floor(Date.now() / 1000) + 3600);
  
    // 构造 swap 输入
    const encryptedSwapAmountIn = await fhevm.createEncryptedInput(fHeSwapAddress, bob.address)
      .add64(ethersjs.parseUnits(swapAmount.toString(), 6))
      .encrypt();
  
    // 先调用 getAmountOut 来初始化分子和分母
    await fHeSwap.connect(bob).getAmountOut(
      encryptedSwapAmountIn.handles[0],
      encryptedSwapAmountIn.inputProof,
      tokenAAddress
    );
  
    // 计算链下 expectedAmountOut
    const encryptedNumerator = await fHeSwap.getEncryptedNumerator();
    const encryptedDenominator = await fHeSwap.getEncryptedDenominator();
    const decryptedNumerator = await fhevm.userDecryptEuint(FhevmType.euint64, ethersjs.hexlify(encryptedNumerator), fHeSwapAddress, bob);
    const decryptedDenominator = await fhevm.userDecryptEuint(FhevmType.euint64, ethersjs.hexlify(encryptedDenominator), fHeSwapAddress, bob);
  
    const expectedClearAmountOut = decryptedNumerator / decryptedDenominator;
    const minClearAmountOut = expectedClearAmountOut + 1n; // 故意大于 expected
  
    console.log("swapAmount:", swapAmount);
    console.log("expectedClearAmountOut:", expectedClearAmountOut.toString());
    console.log("minClearAmountOut:", minClearAmountOut.toString());
  
    const encryptedExpectedAmountOut = await fhevm.createEncryptedInput(fHeSwapAddress, bob.address)
      .add64(expectedClearAmountOut)
      .encrypt();
    const encryptedMinAmountOut = await fhevm.createEncryptedInput(fHeSwapAddress, bob.address)
      .add64(minClearAmountOut)
      .encrypt();
  
    // 调用 swap
    await fHeSwap.connect(bob).swap(
      encryptedSwapAmountIn.handles[0],
      encryptedSwapAmountIn.inputProof,
      encryptedExpectedAmountOut.handles[0],
      encryptedExpectedAmountOut.inputProof,
      encryptedMinAmountOut.handles[0],
      encryptedMinAmountOut.inputProof,
      tokenAAddress,
      bob.address
    );
  
    const bobTokenAAfterHandle = await tokenA.confidentialBalanceOf(bob.address);
    const bobTokenAAfter = await fhevm.userDecryptEuint(FhevmType.euint64, ethersjs.hexlify(bobTokenAAfterHandle), tokenAAddress, bob);
    
    // 更准确地检查 Bob 的 TokenB 余额
    const bobTokenBAfterHandle = await tokenB.confidentialBalanceOf(bob.address);
    const bobTokenBAfter = await fhevm.userDecryptEuint(FhevmType.euint64, ethersjs.hexlify(bobTokenBAfterHandle), tokenBAddress, bob);
  
    console.log("swap 后余额 -> TokenA:", bobTokenAAfter.toString(), "TokenB:", bobTokenBAfter.toString());
  
    if (bobTokenAAfter === bobTokenABefore && bobTokenBAfter === bobTokenBBefore) {
      console.log("✅ select 分支生效：swap 未转账");
    } else {
      console.log("❌ select 分支未生效：swap 发生了转账");
    }
  
    expect(bobTokenAAfter).to.equal(bobTokenABefore);
    expect(bobTokenBAfter).to.equal(bobTokenBBefore);
  });

  it("应该测试 amountOut < minAmountOut 的情况（滑点保护）", async function () {
    console.log("\n--- 测试: amountOut < minAmountOut（滑点保护） ---");
    const charlie = signers.bob; // 使用 Bob 作为 Charlie
    const owner = signers.deployer;
    const swapAmount = 10; // 用户要兑换 10 TokenA
    
    // 设置初始流动性
    console.log("设置初始流动性...");
    // 给所有者铸造代币
    const encryptedMintA = await fhevm.createEncryptedInput(tokenAAddress, owner.address)
      .add64(ethersjs.parseUnits("1000", 6))
      .encrypt();
    const encryptedMintB = await fhevm.createEncryptedInput(tokenBAddress, owner.address)
      .add64(ethersjs.parseUnits("300", 6))
      .encrypt();
    
    await tokenA.connect(owner).mint(owner.address, encryptedMintA.handles[0], encryptedMintA.inputProof);
    await tokenB.connect(owner).mint(owner.address, encryptedMintB.handles[0], encryptedMintB.inputProof);
    
    // 授权 FHESwap 作为操作者
    const operatorExpiry = Math.floor(Date.now() / 1000) + 3600;
    await tokenA.connect(owner).setOperator(fHeSwapAddress, operatorExpiry);
    await tokenB.connect(owner).setOperator(fHeSwapAddress, operatorExpiry);
    
    // 提供流动性
    const encryptedAmount0 = await fhevm.createEncryptedInput(fHeSwapAddress, owner.address)
      .add64(ethersjs.parseUnits("1000", 6))
      .encrypt();
    const encryptedAmount1 = await fhevm.createEncryptedInput(fHeSwapAddress, owner.address)
      .add64(ethersjs.parseUnits("300", 6))
      .encrypt();
    
    await fHeSwap.connect(owner).mint(
      encryptedAmount0.handles[0],
      encryptedAmount0.inputProof,
      encryptedAmount1.handles[0],
      encryptedAmount1.inputProof
    );

    // 给 Charlie 铸造 TokenA
    const encryptedCharlieMintA = await fhevm.createEncryptedInput(tokenAAddress, owner.address)
      .add64(ethersjs.parseUnits(swapAmount.toString(), 6))
      .encrypt();
    await tokenA.connect(owner).mint(charlie.address, encryptedCharlieMintA.handles[0], encryptedCharlieMintA.inputProof);

    const charlieTokenABeforeHandle = await tokenA.confidentialBalanceOf(charlie.address);
    const charlieTokenABefore = await fhevm.userDecryptEuint(FhevmType.euint64, ethersjs.hexlify(charlieTokenABeforeHandle), tokenAAddress, charlie);
    const charlieTokenBBefore = 0n; // Charlie 初始时没有 TokenB

    console.log("Charlie 初始余额 -> TokenA:", charlieTokenABefore.toString(), "TokenB:", charlieTokenBBefore.toString());

    await tokenA.connect(charlie).authorizeSelf(charlieTokenABeforeHandle);
    await tokenA.connect(charlie).setOperator(fHeSwapAddress, Math.floor(Date.now() / 1000) + 3600);

    // 构造 swap 输入
    const encryptedSwapAmountIn = await fhevm.createEncryptedInput(fHeSwapAddress, charlie.address)
      .add64(ethersjs.parseUnits(swapAmount.toString(), 6))
      .encrypt();

    // 先调用 getAmountOut 来初始化分子和分母
    await fHeSwap.connect(charlie).getAmountOut(
      encryptedSwapAmountIn.handles[0],
      encryptedSwapAmountIn.inputProof,
      tokenAAddress
    );

    // 计算链下 expectedAmountOut
    const encryptedNumerator = await fHeSwap.getEncryptedNumerator();
    const encryptedDenominator = await fHeSwap.getEncryptedDenominator();
    const decryptedNumerator = await fhevm.userDecryptEuint(FhevmType.euint64, ethersjs.hexlify(encryptedNumerator), fHeSwapAddress, charlie);
    const decryptedDenominator = await fhevm.userDecryptEuint(FhevmType.euint64, ethersjs.hexlify(encryptedDenominator), fHeSwapAddress, charlie);

    const expectedClearAmountOut = decryptedNumerator / decryptedDenominator;
    
    // 设置 1% 滑点容忍度，但故意设置一个更高的最小值来触发保护
    const slippageTolerance = 0.01; // 1%
    const minClearAmountOut = (expectedClearAmountOut * 99n) / 100n; // 正常的最小值
    
    // 但是故意设置一个比正常最小值更高的值，确保 amountOut < minAmountOut
    const artificiallyHighMinAmountOut = minClearAmountOut + ethersjs.parseUnits("0.1", 6); // 增加 0.1 个代币

    console.log("=== 测试参数 ===");
    console.log("swapAmount:", swapAmount);
    console.log("expectedClearAmountOut:", ethersjs.formatUnits(expectedClearAmountOut, 6));
    console.log("正常 minClearAmountOut (99%):", ethersjs.formatUnits(minClearAmountOut, 6));
    console.log("故意设置的高 minClearAmountOut:", ethersjs.formatUnits(artificiallyHighMinAmountOut, 6));
    console.log("expectedClearAmountOut < artificiallyHighMinAmountOut:", expectedClearAmountOut < artificiallyHighMinAmountOut);

    const encryptedExpectedAmountOut = await fhevm.createEncryptedInput(fHeSwapAddress, charlie.address)
      .add64(expectedClearAmountOut)
      .encrypt();
    const encryptedMinAmountOut = await fhevm.createEncryptedInput(fHeSwapAddress, charlie.address)
      .add64(artificiallyHighMinAmountOut)
      .encrypt();

    // 调用 swap
    await fHeSwap.connect(charlie).swap(
      encryptedSwapAmountIn.handles[0],
      encryptedSwapAmountIn.inputProof,
      encryptedExpectedAmountOut.handles[0],
      encryptedExpectedAmountOut.inputProof,
      encryptedMinAmountOut.handles[0],
      encryptedMinAmountOut.inputProof,
      tokenAAddress,
      charlie.address
    );

    const charlieTokenAAfterHandle = await tokenA.confidentialBalanceOf(charlie.address);
    const charlieTokenAAfter = await fhevm.userDecryptEuint(FhevmType.euint64, ethersjs.hexlify(charlieTokenAAfterHandle), tokenAAddress, charlie);
    
    const charlieTokenBAfterHandle = await tokenB.confidentialBalanceOf(charlie.address);
    const charlieTokenBAfter = await fhevm.userDecryptEuint(FhevmType.euint64, ethersjs.hexlify(charlieTokenBAfterHandle), tokenBAddress, charlie);

    console.log("swap 后余额 -> TokenA:", charlieTokenAAfter.toString(), "TokenB:", charlieTokenBAfter.toString());

    if (charlieTokenAAfter === charlieTokenABefore && charlieTokenBAfter === charlieTokenBBefore) {
      console.log("✅ select 分支生效：amountOut < minAmountOut，swap 未转账");
    } else {
      console.log("❌ select 分支未生效：swap 发生了转账");
    }

    expect(charlieTokenAAfter).to.equal(charlieTokenABefore);
    expect(charlieTokenBAfter).to.equal(charlieTokenBBefore);
  });
});