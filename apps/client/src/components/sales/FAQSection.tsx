import { useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { Text } from "../base/Text";

interface FAQItem {
  question: string;
  answer: string;
}

export function FAQSection({ className = "" }: { className?: string }) {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const faqs: FAQItem[] = [
    {
      question: "What makes Poker Champ different from other training sites?",
      answer: "Poker Champ focuses on structured, practical training rather than just video content. Our interactive decision-based training helps you apply concepts immediately, not just watch them. The program is built specifically for online cash game players who want to see real results.",
    },
    {
      question: "Is the lifetime access really one-time payment?",
      answer: "Yes! Your $200 payment gives you permanent access to all current and future content. No monthly fees, no hidden charges. As we add new lessons, features, and updates, you'll get access to everything at no additional cost.",
    },
    {
      question: "What if I'm not satisfied with the program?",
      answer: "We offer a 30-day money-back guarantee. If you're not completely satisfied with your purchase, contact us within 30 days for a full refund. No questions asked.",
    },
    {
      question: "Do I need poker experience to benefit from the training?",
      answer: "The Boot Camp is designed for players who understand basic poker rules but want to improve their decision-making. Whether you're struggling to beat $1/$2 or looking to move up to higher stakes, the structured curriculum will help you plug leaks and develop a more profitable approach.",
    },
    {
      question: "How does the interactive decision training work?",
      answer: "Instead of just watching videos, you'll face realistic poker scenarios and make decisions. The system provides immediate feedback on your choices, explaining why a decision was good or bad. This active learning approach helps concepts stick much better than passive watching.",
    },
    {
      question: "Can I access the content on mobile devices?",
      answer: "Yes! Poker Champ works on both desktop and mobile devices. You can practice hands, review lessons, and track your progress whether you're at home or on the go.",
    },
    {
      question: "What's included in the 12-lesson Boot Camp?",
      answer: "The Boot Camp covers the most common and costly mistakes players make. Topics include preflop strategy, cbet fundamentals, river decisions, tilt control, bankroll management, and much more. Each lesson builds on the previous one to create a complete foundation for profitable play.",
    },
    {
      question: "How often do you add new content?",
      answer: "We're constantly adding new lessons, drills, and features based on member feedback and evolving game dynamics. As a lifetime member, you'll get access to all new content at no additional cost.",
    },
  ];

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <View className={`space-y-4 ${className}`}>
      <Text variant="h2" className="text-2xl font-bold text-white text-center mb-6">
        Frequently Asked Questions
      </Text>
      
      {faqs.map((faq, index) => (
        <FAQItemCard
          key={index}
          faq={faq}
          isExpanded={expandedItems.has(index)}
          onToggle={() => toggleExpanded(index)}
        />
      ))}
    </View>
  );
}

function FAQItemCard({ 
  faq, 
  isExpanded, 
  onToggle 
}: { 
  faq: FAQItem; 
  isExpanded: boolean; 
  onToggle: () => void; 
}) {
  return (
    <View className="bg-gray-800 rounded-lg overflow-hidden">
      <TouchableOpacity
        onPress={onToggle}
        className="p-4 flex-row justify-between items-center"
      >
        <Text variant="body" className="text-white font-semibold flex-1 mr-4">
          {faq.question}
        </Text>
        <Text variant="body" className="text-brand">
          {isExpanded ? "−" : "+"}
        </Text>
      </TouchableOpacity>
      
      {isExpanded && (
        <View className="px-4 pb-4 border-t border-gray-700">
          <Text variant="caption" className="text-gray-300 leading-relaxed">
            {faq.answer}
          </Text>
        </View>
      )}
    </View>
  );
}
