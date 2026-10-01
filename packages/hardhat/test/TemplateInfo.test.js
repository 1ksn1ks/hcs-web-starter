const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('TemplateInfo', function () {
  it('returns the template name', async function () {
    const Factory = await ethers.getContractFactory('TemplateInfo');
    const info = await Factory.deploy();
    expect(await info.name()).to.equal('hcs-web-starter');
  });
});
