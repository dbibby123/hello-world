import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { createLogger } from './utils/logger';

const logger = createLogger('kafka');

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
}

/**
 * KafkaProducer — publishes OCPP events to topic partitions.
 *
 * Partitioning strategy: messages are keyed by stationId so all events
 * from a single charger land on the same partition → ordered processing.
 *
 * Topics:
 *   ocpp.boot         — BootNotification events
 *   ocpp.status       — StatusNotification events
 *   ocpp.inbound      — All other OCPP CALLs requiring service processing
 *   ocpp.outbound     — Responses from services back to gateway
 *   ocpp.commands     — Remote commands from backend to chargers
 */
export class KafkaProducer {
  private kafka: Kafka;
  private producer: Producer;

  constructor(config: KafkaConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      logLevel: logLevel.WARN,
    });
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30_000,
    });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(topic: string, value: Record<string, unknown>, key?: string): Promise<void> {
    const messageKey = key ?? (value.stationId as string | undefined);
    await this.producer.send({
      topic,
      messages: [{
        key: messageKey,
        value: JSON.stringify(value),
        timestamp: Date.now().toString(),
      }],
    });
  }

  async publishBatch(topic: string, messages: { key: string; value: Record<string, unknown> }[]): Promise<void> {
    await this.producer.send({
      topic,
      messages: messages.map((m) => ({
        key: m.key,
        value: JSON.stringify(m.value),
        timestamp: Date.now().toString(),
      })),
    });
  }
}

export class KafkaConsumer {
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(config: KafkaConfig & { groupId: string }) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      logLevel: logLevel.WARN,
    });
    this.consumer = this.kafka.consumer({ groupId: config.groupId });
  }

  async connect(): Promise<void> {
    await this.consumer.connect();
  }

  async subscribe(topics: string[]): Promise<void> {
    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }
  }

  async run(handler: (topic: string, message: Record<string, unknown>) => Promise<void>): Promise<void> {
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        try {
          const parsed = JSON.parse(message.value.toString()) as Record<string, unknown>;
          await handler(topic, parsed);
        } catch (err) {
          logger.error({ topic, err }, 'Error processing Kafka message');
        }
      },
    });
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }
}
