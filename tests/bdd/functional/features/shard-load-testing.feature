@shard-load
Feature: Shard Load Testing
  As an operator of a sharded aggregator setup
  I want to measure per-shard throughput, success rates, and timing
  So that I can verify shard performance under concurrent load

  Background:
    Given the aggregator is set up
    And the shard topology is discovered

  @shard-load-synchronized
  Scenario Outline: Synchronized batches - <batchSize> ops x <batchCount> batches
    Given <batchSize> x <batchCount> mint operations are prepared for each shard
    When synchronized batches of <batchSize> are submitted <batchCount> times
    Then the shard load report is printed

    Examples:
      | batchSize | batchCount |
      | 500      | 10        |

  @shard-load-independent
  Scenario Outline: Independent batches - <batchSize> ops x <batchCount> batches
    Given <batchSize> x <batchCount> mint operations are prepared for each shard
    When independent batches of <batchSize> are submitted <batchCount> times per shard
    Then the shard load report is printed

    Examples:
      | batchSize | batchCount |
      | 500      | 10      |

  @shard-load-pressure
  Scenario Outline: Constant pressure - <concurrency> concurrent x <totalPerShard> total
    Given <totalPerShard> mint operations are prepared for each shard
    When constant pressure of <concurrency> concurrent operations is applied per shard
    Then the shard load report is printed

    Examples:
      | concurrency | totalPerShard |
      | 1000           | 10000            |
