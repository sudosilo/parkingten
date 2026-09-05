// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IParkingSpot {
    function owner() external view returns (address);
    function spotId() external view returns (string memory);
}

contract ParkingSpotFactory {
    address public platform;
    uint256 public platformFeeBps = 500;

    address[] public allSpots;
    mapping(string => address) public spotById;
    mapping(address => address[]) public spotsByOwner;

    event SpotDeployed(string spotId, address contractAddress, address owner);

    constructor() {
        platform = msg.sender;
    }

    function deploySpot(
        string calldata spotId,
        uint256 baseRatePerHour,
        uint256 subLeaseMarkupBps,
        uint256 ownerSubLeaseCutBps,
        bool subLeaseAllowed
    ) external returns (address) {
        require(spotById[spotId] == address(0), "Spot ID already registered");
        ParkingSpot spot = new ParkingSpot(
            spotId,
            msg.sender,
            platform,
            platformFeeBps,
            baseRatePerHour,
            subLeaseMarkupBps,
            ownerSubLeaseCutBps,
            subLeaseAllowed
        );
        address spotAddr = address(spot);
        allSpots.push(spotAddr);
        spotById[spotId] = spotAddr;
        spotsByOwner[msg.sender].push(spotAddr);
        emit SpotDeployed(spotId, spotAddr, msg.sender);
        return spotAddr;
    }

    function getAllSpots() external view returns (address[] memory) {
        return allSpots;
    }

    function getSpotsByOwner(address owner) external view returns (address[] memory) {
        return spotsByOwner[owner];
    }

    function setPlatformFee(uint256 bps) external {
        require(msg.sender == platform, "Not platform");
        require(bps <= 1000, "Max 10%");
        platformFeeBps = bps;
    }
}
contract ParkingSpot {
    struct Reservation {
        address renter;
        uint256 startTime;
        uint256 endTime;
        uint256 amountPaid;
        bool subLeaseOpen;
        uint256 subLeaseRatePerHour;
        bool active;
    }

    struct SubLease {
        address subRenter;
        uint256 startTime;
        uint256 endTime;
        uint256 amountPaid;
        bool active;
    }

    string public spotId;
    address public owner;
    address public platform;
    uint256 public platformFeeBps;
    uint256 public baseRatePerHour;
    uint256 public subLeaseMarkupBps;
    uint256 public ownerSubLeaseCutBps;
    bool public subLeaseAllowed;
    bool public paused;

    uint256 public reservationCount;
    uint256 public subLeaseCount;

    mapping(uint256 => Reservation) public reservations;
    mapping(uint256 => SubLease) public subLeases;
    mapping(uint256 => uint256) public subLeaseForReservation;

    event Reserved(uint256 reservationId, address renter, uint256 start, uint256 end, uint256 paid);
    event SubLeased(uint256 subLeaseId, uint256 reservationId, address subRenter, uint256 start, uint256 end, uint256 paid);
    event Paused(bool state);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier notPaused() { require(!paused, "Spot paused"); _; }

    constructor(
        string memory _spotId,
        address _owner,
        address _platform,
        uint256 _platformFeeBps,
        uint256 _baseRatePerHour,
        uint256 _subLeaseMarkupBps,
        uint256 _ownerSubLeaseCutBps,
        bool _subLeaseAllowed
    ) {
        spotId = _spotId;
        owner = _owner;
        platform = _platform;
        platformFeeBps = _platformFeeBps;
        baseRatePerHour = _baseRatePerHour;
        subLeaseMarkupBps = _subLeaseMarkupBps;
        ownerSubLeaseCutBps = _ownerSubLeaseCutBps;
        subLeaseAllowed = _subLeaseAllowed;
    }
    function reserve(
        uint256 startTime,
        uint256 endTime,
        bool openForSubLease,
        uint256 subLeaseRatePerHour
    ) external payable notPaused returns (uint256) {
        require(startTime >= block.timestamp, "Start in past");
        require(endTime > startTime, "Invalid window");
        require(endTime - startTime >= 1 hours, "Min 1 hour");

        uint256 hours_ = (endTime - startTime) / 1 hours;
        uint256 total = baseRatePerHour * hours_;
        require(msg.value >= total, "Insufficient payment");
        require(!_overlapsExisting(startTime, endTime), "Time slot taken");

        if (openForSubLease) {
            require(subLeaseAllowed, "Sub-lease not allowed by owner");
            require(subLeaseRatePerHour >= (baseRatePerHour * (10000 + subLeaseMarkupBps)) / 10000, "Sub-lease rate too low");
        }

        uint256 platformFee = (total * platformFeeBps) / 10000;
        uint256 ownerAmount = total - platformFee;

        payable(platform).transfer(platformFee);
        payable(owner).transfer(ownerAmount);

        if (msg.value > total) {
            payable(msg.sender).transfer(msg.value - total);
        }

        uint256 id = reservationCount++;
        reservations[id] = Reservation({
            renter: msg.sender,
            startTime: startTime,
            endTime: endTime,
            amountPaid: total,
            subLeaseOpen: openForSubLease,
            subLeaseRatePerHour: subLeaseRatePerHour,
            active: true
        });

        emit Reserved(id, msg.sender, startTime, endTime, total);
        return id;
    }

    function subLease(
        uint256 reservationId,
        uint256 startTime,
        uint256 endTime
    ) external payable notPaused returns (uint256) {
        Reservation storage res = reservations[reservationId];
        require(res.active, "Reservation not active");
        require(res.subLeaseOpen, "Sub-lease not open");
        require(startTime >= res.startTime && endTime <= res.endTime, "Outside reservation window");
        require(startTime >= block.timestamp, "Start in past");
        require(endTime > startTime, "Invalid window");
        require(endTime - startTime >= 1 hours, "Min 1 hour");
        require(subLeaseForReservation[reservationId] == 0 || !subLeases[subLeaseForReservation[reservationId]].active, "Already sub-leased");

        uint256 hours_ = (endTime - startTime) / 1 hours;
        uint256 total = res.subLeaseRatePerHour * hours_;
        require(msg.value >= total, "Insufficient payment");

        uint256 platformFee = (total * platformFeeBps) / 10000;
        uint256 remaining = total - platformFee;
        uint256 ownerCut = (remaining * ownerSubLeaseCutBps) / 10000;
        uint256 renterProfit = remaining - ownerCut;

        payable(platform).transfer(platformFee);
        payable(owner).transfer(ownerCut);
        payable(res.renter).transfer(renterProfit);

        if (msg.value > total) {
            payable(msg.sender).transfer(msg.value - total);
        }

        uint256 id = subLeaseCount++;
        subLeases[id] = SubLease({
            subRenter: msg.sender,
            startTime: startTime,
            endTime: endTime,
            amountPaid: total,
            active: true
        });
        subLeaseForReservation[reservationId] = id;

        emit SubLeased(id, reservationId, msg.sender, startTime, endTime, total);
        return id;
    }

    function setPaused(bool state) external onlyOwner {
        paused = state;
        emit Paused(state);
    }

    function updateTerms(
        uint256 _baseRatePerHour,
        uint256 _subLeaseMarkupBps,
        uint256 _ownerSubLeaseCutBps,
        bool _subLeaseAllowed
    ) external onlyOwner {
        baseRatePerHour = _baseRatePerHour;
        subLeaseMarkupBps = _subLeaseMarkupBps;
        ownerSubLeaseCutBps = _ownerSubLeaseCutBps;
        subLeaseAllowed = _subLeaseAllowed;
    }

    function getReservation(uint256 id) external view returns (Reservation memory) {
        return reservations[id];
    }

    function getSubLease(uint256 id) external view returns (SubLease memory) {
        return subLeases[id];
    }

    function _overlapsExisting(uint256 start, uint256 end) internal view returns (bool) {
        for (uint256 i = 0; i < reservationCount; i++) {
            Reservation storage r = reservations[i];
            if (!r.active) continue;
            if (start < r.endTime && end > r.startTime) return true;
        }
        return false;
    }
}
